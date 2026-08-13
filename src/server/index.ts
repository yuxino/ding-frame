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

const app = Fastify({ logger: true, bodyLimit: config.maxUploadBytes + 1024 * 1024 });
await app.register(multipart, { limits: { files: 1, fileSize: config.maxUploadBytes } });

app.get("/api/health", async () => ({ ok: true, service: "koma", asrProvider: config.asrProvider, analysisProvider: config.analysisProvider, configured: { asr: asrIsConfigured(), analysis: analysisIsConfigured() }, mock: { asr: config.asrProvider === "mock", analysis: config.analysisProvider === "mock" } }));

app.post("/api/analyze/upload", async (request: FastifyRequest, reply: FastifyReply) => {
  let job: Job | undefined;
  try {
    const part = await request.file();
    if (!part) return reply.code(400).send({ error: "没有找到视频文件。" });
    if (!part.mimetype.startsWith("video/")) return reply.code(415).send({ error: "请放入视频文件。" });
    job = await createJob({ source: "upload", title: part.filename });
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
    const body = request.body as { url?: unknown } | undefined;
    const rawUrl = body?.url;
    const url = normalizeVideoUrl(extractUrlFromText(rawUrl) || (typeof rawUrl === "string" ? rawUrl.trim() : ""));
    validateVideoUrl(url);
    job = await createJob({ source: "url", title: new URL(url).pathname.split("/").pop() || "视频地址" });
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
