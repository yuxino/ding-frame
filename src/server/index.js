import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { isIP } from "node:net";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { config } from "./config.js";
import { createJob, getJob, purgeJob, serializeJob, updateJob } from "./jobs.js";
import { enqueueAnalysis } from "./pipeline.js";
import { headersForVideoUrl } from "./url-source.js";
import { inspectVideo } from "./video.js";

const app = Fastify({ logger: true, bodyLimit: config.maxUploadBytes + 1024 * 1024 });
await app.register(multipart, { limits: { files: 1, fileSize: config.maxUploadBytes } });

app.get("/api/health", async () => ({ ok: true, service: "between-frames", asrProvider: config.asrProvider, analysisProvider: config.analysisProvider }));

app.post("/api/analyze/upload", async (request, reply) => {
  let job;
  try {
    const part = await request.file();
    if (!part) return reply.code(400).send({ error: "没有找到视频文件。" });
    if (!part.mimetype.startsWith("video/")) return reply.code(415).send({ error: "请放入视频文件。" });
    job = await createJob({ source: "upload", title: part.filename });
    const inputPath = join(job.dir, `input${extensionFor(part.filename)}`);
    job.inputPath = inputPath;
    await streamToFile(part.file, inputPath, config.maxUploadBytes);
    if (part.file.truncated) throw new Error(`视频太大了，第一版最多支持 ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB。`);
    enqueueAnalysis(job);
    return reply.code(202).send({ jobId: job.id });
  } catch (error) {
    if (job) await purgeJob(job.id);
    return reply.code(error.statusCode || 400).send({ error: error.message });
  }
});

app.post("/api/analyze/url", async (request, reply) => {
  let job;
  try {
    const url = request.body?.url;
    validateVideoUrl(url);
    job = await createJob({ source: "url", title: new URL(url).pathname.split("/").pop() || "视频地址" });
    updateJob(job, { progress: { stage: "downloading", percent: 8, detail: "正在把视频放入临时空间。" } });
    const inputPath = join(job.dir, "input.mp4");
    job.inputPath = inputPath;
    await downloadUrl(url, inputPath, job);
    enqueueAnalysis(job);
    return reply.code(202).send({ jobId: job.id });
  } catch (error) {
    if (job) await purgeJob(job.id);
    return reply.code(error.statusCode || 400).send({ error: error.message });
  }
});

app.get("/api/jobs/:id", async (request, reply) => {
  const job = getJob(request.params.id);
  if (!job) return reply.code(404).send({ error: "这次分析已经消失了。" });
  return reply.header("cache-control", "no-store").send(serializeJob(job));
});

app.delete("/api/jobs/:id", async (request, reply) => {
  await purgeJob(request.params.id);
  return reply.code(204).send();
});

app.get("/api/jobs/:id/frames/:filename", async (request, reply) => {
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

async function streamToFile(readable, outputPath, maxBytes) {
  let bytes = 0;
  const counter = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; if (bytes > maxBytes) return callback(new Error(`视频太大了，第一版最多支持 ${Math.round(maxBytes / 1024 / 1024)} MB。`)); callback(null, chunk); } });
  await pipeline(readable, counter, createWriteStream(outputPath));
  return bytes;
}

async function downloadUrl(url, outputPath, job) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await rm(outputPath, { force: true });
      const response = await fetch(url, { redirect: "follow", headers: { ...headersForVideoUrl(url), "accept-encoding": "identity" }, signal: AbortSignal.timeout(60_000) });
      if (!response.ok || !response.body) throw new Error(`视频地址无法访问：${response.status}`);
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html") || contentType.includes("text/plain")) throw new Error("这个地址返回的是网页，不是可直接下载的视频文件。");
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > config.maxUploadBytes) throw new Error(`视频太大了，第一版最多支持 ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB。`);
      const stream = Readable.fromWeb(response.body);
      const bytes = await streamToFile(stream, outputPath, config.maxUploadBytes);
      if (!bytes) throw new Error("视频下载结果为空。");
      if (contentLength && bytes !== contentLength) throw new Error(`视频下载不完整（收到 ${bytes} / ${contentLength} 字节）。`);
      await inspectVideo(outputPath);
      updateJob(job, { progress: { stage: "inspecting", percent: 12, detail: "视频已进入临时空间。" } });
      return;
    } catch (error) {
      lastError = error;
      if (error.message.startsWith("视频太长") || error.message.includes("不是可直接下载的视频")) throw error;
      if (attempt < 3) updateJob(job, { progress: { stage: "downloading", percent: 8, detail: `视频没有完整到达，正在重新取回（${attempt}/3）。` } });
    }
  }
  throw new Error(`视频下载不完整，已自动重试 3 次。${lastError ? ` ${lastError.message}` : ""}`);
}

function validateVideoUrl(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("请输入视频地址。");
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("只支持 http 或 https 视频地址。");
  if (isPrivateHost(parsed.hostname)) throw new Error("不支持访问本机或内网地址。");
}

function isPrivateHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (["localhost", "0.0.0.0", "::1"].includes(normalized) || normalized.endsWith(".local") || normalized.endsWith(".internal")) return true;
  if (isIP(normalized) !== 4) return isIP(normalized) === 6 && (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:"));
  const octets = normalized.split(".").map(Number);
  return octets[0] === 10 || octets[0] === 127 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 169 && octets[1] === 254);
}

function extensionFor(filename) {
  const extension = filename.match(/\.[a-z0-9]{2,5}$/i)?.[0]?.toLowerCase();
  return extension || ".mp4";
}
