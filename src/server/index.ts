import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { isIP } from "node:net";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { analysisIsConfigured, asrIsConfigured, config } from "./config.js";
import { createJob, getJob, purgeJob, serializeJob, updateJob, type Job } from "./jobs.js";
import { getTempAudio } from "./temp-audio.js";
import { enqueueAnalysis } from "./pipeline.js";
import { streamToFile } from "./download.js";
import { extractUrlFromText } from "./resolver.js";
import { normalizeVideoUrl } from "./url-source.js";
import { parseByteRange } from "./video-stream.js";
import { createDailyLimiter } from "./rate-limit.js";
import { ARTIFACT_FORMATS, parseAnalysisSpec } from "./analysis-spec.js";
import { contentDisposition } from "./artifacts.js";

const app = Fastify({ logger: true, bodyLimit: config.maxUploadBytes + 1024 * 1024, trustProxy: config.trustProxy });
const demoLimiter = createDailyLimiter(config.demoRequestsPerIpPerDay);
await app.register(multipart, { limits: { files: 1, fileSize: config.maxUploadBytes } });

app.get("/api/health", async () => ({
  ok: true,
  service: "koma",
  providers: { asr: config.asrProvider, vision: config.visionProvider },
  asrProvider: config.asrProvider,
  analysisProvider: config.visionProvider,
  models: { asr: config.asrModel || null, vision: config.visionModel || null },
  limits: { maxUploadBytes: config.maxUploadBytes, maxDurationSeconds: config.maxDurationSeconds, resultTtlSeconds: config.resultTtlSeconds },
  features: { customExtraction: true, rawExtractionEndpoint: true, downloadableArtifacts: true, artifactFormats: ARTIFACT_FORMATS },
  configured: { asr: asrIsConfigured(), vision: analysisIsConfigured(), analysis: analysisIsConfigured() },
  demoLimitPerIpPerDay: config.demoRequestsPerIpPerDay || null,
  mock: { asr: config.asrProvider === "mock", vision: config.visionProvider === "mock", analysis: config.visionProvider === "mock" }
}));

app.post("/api/analyze/upload", async (request: FastifyRequest, reply: FastifyReply) => {
  let job: Job | undefined;
  try {
    const part = await request.file();
    if (!part) return reply.code(400).send({ error: "没有找到视频文件。" });
    if (!part.mimetype.startsWith("video/")) return reply.code(415).send({ error: "请放入视频文件。" });
    const analysisSpec = parseAnalysisSpec({
      instruction: multipartFieldValue(part.fields, "instruction"),
      outputSchema: multipartFieldValue(part.fields, "outputSchema"),
      artifactFormats: multipartFieldValue(part.fields, "artifactFormats")
    });
    if (!acceptDemoRequest(request, reply)) return;
    const language = requestLanguage((request.query as { lang?: string } | undefined)?.lang);
    job = await createJob({ source: "upload", title: part.filename, language, analysisSpec });
    const inputPath = join(job.dir, `input${extensionFor(part.filename)}`);
    job.inputPath = inputPath;
    job.inputMimeType = part.mimetype;
    await streamToFile(part.file as unknown as NodeJS.ReadableStream, inputPath, config.maxUploadBytes);
    if (part.file.truncated) throw new Error(`视频太大了，第一版最多支持 ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB。`);
    enqueueAnalysis(job);
    return reply.code(202).send({ jobId: job.id });
  } catch (error) {
    if (job) await purgeJob(job.id);
    return reply.code(statusCodeOf(error) || 400).send({ error: messageOf(error) });
  }
});

app.post("/api/analyze/url", async (request: FastifyRequest, reply: FastifyReply) => {
  let job: Job | undefined;
  try {
    const body = request.body as { url?: unknown; lang?: unknown; instruction?: unknown; outputSchema?: unknown; artifactFormats?: unknown } | undefined;
    const rawUrl = body?.url;
    const url = normalizeVideoUrl(extractUrlFromText(rawUrl) || (typeof rawUrl === "string" ? rawUrl.trim() : ""));
    validateVideoUrl(url);
    const analysisSpec = parseAnalysisSpec({ instruction: body?.instruction, outputSchema: body?.outputSchema, artifactFormats: body?.artifactFormats });
    if (!acceptDemoRequest(request, reply)) return;
    job = await createJob({ source: "url", title: new URL(url).pathname.split("/").pop() || "视频地址", language: requestLanguage(body?.lang), analysisSpec });
    job.sourceUrl = url;
    updateJob(job, { progress: { stage: "resolving", percent: 5, detail: "正在解析视频真实地址。" } });
    enqueueAnalysis(job);
    return reply.code(202).send({ jobId: job.id });
  } catch (error) {
    if (job) await purgeJob(job.id);
    return reply.code(statusCodeOf(error) || 400).send({ error: messageOf(error) });
  }
});

app.get("/api/jobs/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  const job = getJob(request.params.id);
  if (!job) return reply.code(404).send({ error: "这次分析已经消失了。" });
  return reply.header("cache-control", "no-store").send(serializeJob(job));
});

// Programmatic callers can fetch exactly the requested JSON value without Koma's summary wrapper.
app.get("/api/jobs/:id/extraction", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  const job = getJob(request.params.id);
  if (!job) return reply.code(404).send({ error: "这次分析已经消失了。" });
  if (job.status !== "done" || !job.result) return reply.code(409).send({ error: "结构化提取还没有完成。" });
  if (!Object.prototype.hasOwnProperty.call(job.result, "extractedData")) {
    return reply.code(404).send({ error: "这次任务没有请求结构化提取。" });
  }
  return reply.header("cache-control", "no-store").type("application/json; charset=utf-8").send(JSON.stringify(job.result.extractedData));
});

app.get("/api/jobs/:id/artifacts/:artifactId", async (request: FastifyRequest<{ Params: { id: string; artifactId: string } }>, reply: FastifyReply) => {
  const job = getJob(request.params.id);
  if (!job) return reply.code(404).send({ error: "这次分析已经消失了。" });
  if (job.status !== "done" || !job.result) return reply.code(409).send({ error: "产物文件还没有生成完成。" });
  const artifact = job.result.artifacts?.find((item) => item.id === request.params.artifactId);
  if (!artifact) return reply.code(404).send({ error: "找不到这个产物文件。" });
  return reply
    .header("cache-control", "no-store")
    .header("content-disposition", contentDisposition(artifact.name))
    .type(artifact.mimeType)
    .send(artifact.content);
});

app.delete("/api/jobs/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  await purgeJob(request.params.id);
  return reply.code(204).send();
});

app.get("/api/jobs/:id/frames/:filename", async (request: FastifyRequest<{ Params: { id: string; filename: string } }>, reply: FastifyReply) => {
  const job = getJob(request.params.id);
  if (!job || !job.result) return reply.code(404).send({ error: "这张抽帧已经消失了。" });
  const filename = basename(request.params.filename);
  const frame = job.result.frames.find((item) => item.filename === filename);
  if (!frame) return reply.code(404).send({ error: "找不到这张抽帧。" });
  const framePath = resolve(job.dir, "frames", filename);
  if (!framePath.startsWith(resolve(job.dir, "frames"))) return reply.code(400).send({ error: "非法文件路径。" });
  try {
    await stat(framePath);
    return reply.header("cache-control", "no-store").type("image/jpeg").send(createReadStream(framePath));
  } catch {
    return reply.code(404).send({ error: "这张抽帧已经消失了。" });
  }
});

app.get("/api/temp/:token", async (request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
  const filePath = getTempAudio(request.params.token);
  if (!filePath) return reply.code(404).send({ error: "这个临时文件已经消失了。" });
  try {
    const info = await stat(filePath);
    return reply
      .header("content-type", "audio/mpeg")
      .header("content-length", info.size)
      .header("cache-control", "no-store")
      .send(createReadStream(filePath));
  } catch {
    return reply.code(404).send({ error: "这个临时文件已经消失了。" });
  }
});

app.get("/api/jobs/:id/video", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  const job = getJob(request.params.id);
  if (!job?.result || !job.inputPath) return reply.code(404).send({ error: "这段视频已经消失了。" });
  try {
    const info = await stat(job.inputPath);
    const rangeHeader = request.headers.range;
    const range = rangeHeader ? parseByteRange(rangeHeader, info.size) : null;
    if (rangeHeader && !range) {
      return reply.code(416).header("content-range", `bytes */${info.size}`).send();
    }

    reply
      .header("accept-ranges", "bytes")
      .header("cache-control", "no-store")
      .type(normalizeVideoContentType(job.inputMimeType));

    if (!range) {
      return reply.header("content-length", info.size).send(createReadStream(job.inputPath));
    }

    return reply
      .code(206)
      .header("content-range", `bytes ${range.start}-${range.end}/${info.size}`)
      .header("content-length", range.end - range.start + 1)
      .send(createReadStream(job.inputPath, range));
  } catch {
    return reply.code(404).send({ error: "这段视频已经消失了。" });
  }
});

const distPath = resolve("dist");
try {
  await stat(distPath);
  await app.register(fastifyStatic, { root: distPath });
  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith("/api/")) return reply.code(404).send({ error: "没有找到这个地址。" });
    return reply.sendFile("index.html");
  });
} catch {
  app.get("/", async (_, reply) => reply.type("text/plain").send("Run npm run dev for the frontend, or npm run build first."));
}

await app.listen({ port: config.port, host: "0.0.0.0" });

function validateVideoUrl(value: string): void {
  if (typeof value !== "string" || !value.trim()) throw new Error("请输入视频地址。");
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("只支持 http 或 https 视频地址。");
  if (isPrivateHost(parsed.hostname)) throw new Error("不支持访问本机或内网地址。");
}

function isPrivateHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (["localhost", "0.0.0.0", "::1"].includes(normalized) || normalized.endsWith(".local") || normalized.endsWith(".internal")) return true;
  if (isIP(normalized) !== 4) return isIP(normalized) === 6 && (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:"));
  const octets = normalized.split(".").map(Number);
  return octets[0] === 10 || octets[0] === 127 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 169 && octets[1] === 254);
}

function extensionFor(filename: string): string {
  const extension = filename.match(/\.[a-z0-9]{2,5}$/i)?.[0]?.toLowerCase();
  return extension || ".mp4";
}

function normalizeVideoContentType(value: string | undefined): string {
  const type = typeof value === "string" ? value.split(";", 1)[0].trim().toLowerCase() : "";
  return type.startsWith("video/") ? type : "video/mp4";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function statusCodeOf(error: unknown): number | undefined {
  return (error as { statusCode?: number })?.statusCode;
}

function acceptDemoRequest(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!config.demoRequestsPerIpPerDay) return true;
  const result = demoLimiter.consume(request.ip);
  reply
    .header("x-ratelimit-limit", config.demoRequestsPerIpPerDay)
    .header("x-ratelimit-remaining", result.remaining)
    .header("x-ratelimit-reset", Math.floor(result.resetAt / 1000));
  if (result.allowed) return true;
  reply.code(429).send({ error: "今天的公开演示次数已经用完，请明天再来，或在本地配置自己的模型 Key。" });
  return false;
}

// 客户端把界面语言随请求带来，AI 生成文案按该语言输出；缺省中文。
function requestLanguage(value: unknown): "en" | "zh" {
  return value === "en" ? "en" : "zh";
}

function multipartFieldValue(fields: unknown, name: string): unknown {
  if (!fields || typeof fields !== "object") return undefined;
  const raw = (fields as Record<string, unknown>)[name];
  const field = Array.isArray(raw) ? raw[0] : raw;
  if (!field || typeof field !== "object") return undefined;
  return (field as { value?: unknown }).value;
}
