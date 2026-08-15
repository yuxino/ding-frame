#!/usr/bin/env node
// Koma headless mode: analyze a local video or video URL and output JSON.
// Usage:
//   node dist-server/cli.js <video path or URL> [--json output] [--frames-dir directory]
// Progress is written to stderr. Analysis output is written to stdout or --json.
import { copyFile, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { config } from "./config.js";
import { downloadUrl } from "./download.js";
import { analyzeMedia } from "./pipeline.js";

const HELP = `Koma CLI

Usage:
  node dist-server/cli.js <video path or URL> [options]

Options:
  --json <path>        Write analysis result to a JSON file
  --frames-dir <path>  Keep extracted key frames in this directory
  --lang <en|zh>       Language for AI-generated copy (title, summary, tags); default zh
  -h, --help           Show help
`;

interface CliOptions {
  input: string;
  jsonPath: string | null;
  framesDir: string | null;
  language: "en" | "zh";
}

async function main(): Promise<void> {
  const { input, jsonPath, framesDir, language } = parseArgs(process.argv.slice(2));
  const tempDir = await mkdtemp(join(config.tempRoot, "koma-cli-"));
  let inputPath: string;
  try {
    inputPath = await prepareInput(input, tempDir);
    const title = basename(inputPath);
    const result = await analyzeMedia({
      inputPath,
      title,
      framesDir: join(tempDir, "frames"),
      audioDir: join(tempDir, "audio"),
      language,
      onProgress: (progress) => console.error(`[koma] ${progress.percent}% ${progress.detail}`)
    });

    if (config.asrProvider === "mock") console.error("[koma] ASR is running in demo mode. Configure DASHSCOPE_API_KEY for real transcription.");
    if (config.analysisProvider === "mock") console.error("[koma] Vision analysis is running in demo mode. Configure a vision model API key for real analysis.");

    if (framesDir) {
      const target = resolve(framesDir);
      await mkdir(target, { recursive: true });
      for (const frame of result.frames) {
        const targetPath = join(target, frame.filename);
        await copyFile(join(tempDir, "frames", frame.filename), targetPath);
        frame.path = targetPath;
      }
      console.error(`[koma] Key frames saved to ${target}`);
    }

    const payload = JSON.stringify(result, null, 2) + "\n";
    if (jsonPath) {
      await writeFile(resolve(jsonPath), payload, "utf8");
      console.error(`[koma] Result written to ${jsonPath}`);
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
    console.error(`[koma] Downloading ${input}`);
    // 复用 HTTP 服务的下载逻辑：自带时长预检、取消支持和重试
    await downloadUrl(input, outputPath);
    return outputPath;
  }
  const inputPath = resolve(input);
  try {
    await stat(inputPath);
  } catch {
    throw new Error(`Video file not found: ${input}`);
  }
  return inputPath;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { input: "", jsonPath: null, framesDir: null, language: "zh" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(HELP);
      process.exit(0);
    } else if (arg === "--json") {
      options.jsonPath = args[++index];
      if (!options.jsonPath) throw new Error("--json requires a file path.");
    } else if (arg === "--frames-dir") {
      options.framesDir = args[++index];
      if (!options.framesDir) throw new Error("--frames-dir requires a directory path.");
    } else if (arg === "--lang") {
      const value = args[++index];
      if (value !== "en" && value !== "zh") throw new Error("--lang accepts en or zh.");
      options.language = value;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!options.input) {
      options.input = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  if (!options.input) throw new Error("Provide a video file path or video URL. Use --help for usage.");
  return options;
}

main().catch((error) => {
  console.error(`[koma] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
