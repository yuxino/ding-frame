import { createWriteStream } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { config } from "./config.js";

const ffmpegBin = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";
const ffprobeBin = process.env.FFPROBE_PATH || ffprobeStatic?.path || "ffprobe";

export async function inspectVideo(inputPath) {
  const output = await runCommand(ffprobeBin, ["-v", "error", "-show_format", "-show_streams", "-of", "json", inputPath]);
  const parsed = JSON.parse(output.stdout);
  const durationSeconds = Number.parseFloat(parsed.format?.duration || "0");
  if (durationSeconds > config.maxDurationSeconds) {
    throw new Error(`视频太长了，第一版最多支持 ${Math.round(config.maxDurationSeconds / 60)} 分钟。`);
  }
  return {
    durationMs: Math.round(durationSeconds * 1000),
    width: parsed.streams?.find((stream) => stream.codec_type === "video")?.width || null,
    height: parsed.streams?.find((stream) => stream.codec_type === "video")?.height || null
  };
}

export async function extractFrames(inputPath, outputDir) {
  await mkdir(outputDir, { recursive: true });
  await runCommand(ffmpegBin, ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath, "-vf", `fps=1/${config.frameIntervalSeconds},scale=960:-2`, "-frames:v", String(config.maxFrames), join(outputDir, "frame-%03d.jpg")]);
  const names = (await readdir(outputDir)).filter((name) => name.endsWith(".jpg")).sort();
  return names.map((filename, index) => ({ filename: basename(filename), atMs: index * config.frameIntervalSeconds * 1000 }));
}

export async function extractAudio(inputPath, outputPath) {
  await runCommand(ffmpegBin, ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", outputPath]);
  const audio = await stat(outputPath);
  if (!audio.size) throw new Error("视频里没有可识别的声音。");
  return outputPath;
}

export async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => reject(new Error(`${command} 不可用：${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(stderr.trim() || `${command} 退出码 ${code}`));
    });
  });
}
