import { createWriteStream } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import ffmpegStatic from "ffmpeg-static";
import { config } from "./config.js";

const require = createRequire(import.meta.url);
const ffprobeStatic = require("ffprobe-static") as { path: string };

const ffmpegBin: string = process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string) || "ffmpeg";
const ffprobeBin: string = process.env.FFPROBE_PATH || ((ffprobeStatic as { path?: string } | null)?.path) || "ffprobe";

export interface MediaInfo {
  durationMs: number;
  width: number | null;
  height: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  hasNativeSubtitles: boolean;
}

export interface FrameInfo {
  filename: string;
  atMs: number;
}

export interface AudioSegment {
  filename: string;
  startMs: number;
  endMs: number;
  path: string;
}

export async function inspectVideo(inputPath: string): Promise<MediaInfo> {
  const output = await runCommand(ffprobeBin, ["-v", "error", "-show_format", "-show_streams", "-of", "json", inputPath]);
  const parsed = JSON.parse(output.stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
  };
  const durationSeconds = Number.parseFloat(parsed.format?.duration || "0");
  if (durationSeconds > config.maxDurationSeconds) {
    throw new Error(`视频太长了，第一版最多支持 ${Math.round(config.maxDurationSeconds / 60)} 分钟。`);
  }
  return {
    durationMs: Math.round(durationSeconds * 1000),
    width: parsed.streams?.find((stream) => stream.codec_type === "video")?.width ?? null,
    height: parsed.streams?.find((stream) => stream.codec_type === "video")?.height ?? null,
    hasVideo: parsed.streams?.some((stream) => stream.codec_type === "video") || false,
    hasAudio: parsed.streams?.some((stream) => stream.codec_type === "audio") || false,
    hasNativeSubtitles: parsed.streams?.some((stream) => stream.codec_type === "subtitle") || false
  };
}

export async function extractFullAudio(inputPath: string, outputPath: string): Promise<string> {
  await runCommand(ffmpegBin, [
    "-hide_banner", "-loglevel", "error", "-y", "-i", inputPath,
    "-vn", "-ac", "1", "-ar", "16000",
    "-c:a", "libmp3lame", "-b:a", "128k",
    outputPath
  ]);
  return outputPath;
}

export async function extractFrames(inputPath: string, outputDir: string): Promise<FrameInfo[]> {
  await mkdir(outputDir, { recursive: true });
  await runCommand(ffmpegBin, ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath, "-vf", `fps=1/${config.frameIntervalSeconds},scale=960:-2`, "-frames:v", String(config.maxFrames), join(outputDir, "frame-%03d.jpg")]);
  const names = (await readdir(outputDir)).filter((name) => name.endsWith(".jpg")).sort();
  return names.map((filename, index) => ({ filename: basename(filename), atMs: index * config.frameIntervalSeconds * 1000 }));
}

export async function extractAudioSegments(inputPath: string, outputDir: string, durationMs: number): Promise<AudioSegment[]> {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await runCommand(ffmpegBin, [
    "-hide_banner", "-loglevel", "error", "-y", "-i", inputPath,
    "-vn", "-map", "0:a:0", "-ac", "1", "-ar", "16000",
    "-c:a", "libmp3lame", "-b:a", "64k",
    "-f", "segment", "-segment_time", String(config.asrSegmentSeconds),
    "-reset_timestamps", "1", join(outputDir, "segment-%03d.mp3")
  ]);
  const names = (await readdir(outputDir)).filter((name) => name.endsWith(".mp3")).sort();
  return createAudioSegmentMetadata(names, durationMs, config.asrSegmentSeconds)
    .map((segment) => ({ ...segment, path: join(outputDir, segment.filename) }));
}

export function createAudioSegmentMetadata(names: string[], durationMs: number, segmentSeconds: number): Array<Omit<AudioSegment, "path">> {
  const segmentMs = segmentSeconds * 1000;
  return names.map((filename, index) => {
    const startMs = index * segmentMs;
    return {
      filename,
      startMs,
      endMs: Math.min(durationMs, startMs + segmentMs)
    };
  });
}

export function runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
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
