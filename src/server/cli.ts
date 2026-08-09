#!/usr/bin/env node
// 盯帧无头模式：脚本化分析一个本地视频或视频 URL，结果以 JSON 输出。
// 用法：
//   node dist-server/cli.js <视频文件路径或视频URL> [--json 结果文件] [--frames-dir 保留关键帧的目录]
// 进度信息输出到 stderr，分析结果输出到 stdout（或 --json 指定文件），方便管道处理。
import { createWriteStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { config } from "./config.js";
import { analyzeMedia } from "./pipeline.js";
import { headersForVideoUrl } from "./url-source.js";

const HELP = `盯帧无头模式

用法：
  node dist-server/cli.js <视频文件路径或视频URL> [选项]

选项：
  --json <路径>        把分析结果写入文件
  --frames-dir <路径>  保留关键帧图片到该目录
  -h, --help           显示帮助
`;

interface CliOptions {
  input: string;
  jsonPath: string | null;
  framesDir: string | null;
}

async function main(): Promise<void> {
  const { input, jsonPath, framesDir } = parseArgs(process.argv.slice(2));
  const tempDir = await mkdtemp(join(config.tempRoot, "ding-frame-cli-"));
  let inputPath: string;
  try {
    inputPath = await prepareInput(input, tempDir);
    const title = basename(inputPath);
    const result = await analyzeMedia({
      inputPath,
      title,
      framesDir: join(tempDir, "frames"),
      audioDir: join(tempDir, "audio"),
      onProgress: (progress) => console.error(`[ding-frame] ${progress.percent}% ${progress.detail}`)
    });

    if (config.asrProvider === "mock") console.error("[ding-frame] 提示：当前是演示听写，配置 DASHSCOPE_API_KEY 后才会识别真实人声。");
    if (config.analysisProvider === "mock") console.error("[ding-frame] 提示：当前是演示画面分析，配置视觉模型 API Key 后才会理解真实画面。");

    if (framesDir) {
      const target = resolve(framesDir);
      await mkdir(target, { recursive: true });
      for (const frame of result.frames) {
        const targetPath = join(target, frame.filename);
        await copyFile(join(tempDir, "frames", frame.filename), targetPath);
        frame.path = targetPath;
      }
      console.error(`[ding-frame] 关键帧已保留到 ${target}`);
    }

    const payload = JSON.stringify(result, null, 2) + "\n";
    if (jsonPath) {
      await writeFile(resolve(jsonPath), payload, "utf8");
      console.error(`[ding-frame] 结果已写入 ${jsonPath}`);
    } else {
      process.stdout.write(payload);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function prepareInput(input: string, tempDir: string): Promise<string> {
  if (/^https?:\/\//i.test(input)) {
    const outputPath = join(tempDir, "input.mp4");
    console.error(`[ding-frame] 下载 ${input}`);
    await downloadInput(input, outputPath);
    return outputPath;
  }
  const inputPath = resolve(input);
  try {
    await stat(inputPath);
  } catch {
    throw new Error(`找不到视频文件：${input}`);
  }
  return inputPath;
}

async function downloadInput(url: string, outputPath: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow", headers: { ...headersForVideoUrl(url), "accept-encoding": "identity" }, signal: AbortSignal.timeout(60_000) });
      if (!response.ok || !response.body) throw new Error(`视频地址无法访问：${response.status}`);
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html") || contentType.includes("text/plain")) throw new Error("这个地址返回的是网页，不是可直接下载的视频文件。");
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > config.maxUploadBytes) throw new Error(`视频太大了，第一版最多支持 ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB。`);
      await streamToFile(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), outputPath, config.maxUploadBytes);
      return;
    } catch (error) {
      lastError = error;
      if (error instanceof Error && (error.message.startsWith("视频太大") || error.message.includes("不是可直接下载的视频"))) throw error;
      if (attempt < 3) console.error(`[ding-frame] 视频没有完整到达，正在重新取回（${attempt}/3）。`);
    }
  }
  throw new Error(`视频下载不完整，已自动重试 3 次。${lastError instanceof Error ? ` ${lastError.message}` : ""}`);
}

async function streamToFile(readable: NodeJS.ReadableStream, outputPath: string, maxBytes: number): Promise<number> {
  let bytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding: string, callback: (error?: Error | null, data?: Buffer) => void) {
      bytes += chunk.length;
      if (bytes > maxBytes) return callback(new Error(`视频太大了，第一版最多支持 ${Math.round(maxBytes / 1024 / 1024)} MB。`));
      callback(null, chunk);
    }
  });
  await pipeline(readable, counter, createWriteStream(outputPath));
  return bytes;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { input: "", jsonPath: null, framesDir: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(HELP);
      process.exit(0);
    } else if (arg === "--json") {
      options.jsonPath = args[++index];
      if (!options.jsonPath) throw new Error("--json 需要带一个文件路径。");
    } else if (arg === "--frames-dir") {
      options.framesDir = args[++index];
      if (!options.framesDir) throw new Error("--frames-dir 需要带一个目录路径。");
    } else if (arg.startsWith("-")) {
      throw new Error(`未知选项：${arg}`);
    } else if (!options.input) {
      options.input = arg;
    } else {
      throw new Error(`多余参数：${arg}`);
    }
  }
  if (!options.input) throw new Error("请给出一个视频文件路径或视频 URL（--help 查看用法）。");
  return options;
}

main().catch((error) => {
  console.error(`[ding-frame] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
