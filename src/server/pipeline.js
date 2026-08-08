import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { analyze } from "./analysis.js";
import { transcribe } from "./asr.js";
import { updateJob } from "./jobs.js";
import { extractAudio, extractFrames, inspectVideo } from "./video.js";

export function enqueueAnalysis(job) {
  setImmediate(() => runAnalysis(job).catch((error) => {
    updateJob(job, { status: "failed", error: error.message, progress: { stage: "failed", percent: 100, detail: error.message } });
  }));
}

async function runAnalysis(job) {
  const inputPath = job.inputPath;
  const framesDir = join(job.dir, "frames");
  const audioPath = join(job.dir, "audio.wav");
  try {
    updateJob(job, { status: "processing", progress: { stage: "inspecting", percent: 12, detail: "正在读取视频尺寸和时长。" } });
    const media = await inspectVideo(inputPath);
    updateJob(job, { progress: { stage: "extracting_frames", percent: 30, detail: "从视频里挑出几个视觉切片。" } });
    const frames = await extractFrames(inputPath, framesDir);
    updateJob(job, { progress: { stage: "extracting_audio", percent: 46, detail: "把声音整理成适合听写的轨道。" } });
    await mkdir(job.dir, { recursive: true });
    await extractAudio(inputPath, audioPath);
    updateJob(job, { progress: { stage: "transcribing", percent: 65, detail: config.asrProvider === "mock" ? "演示听写正在生成。" : "Paraformer 正在听写人声。" } });
    const transcript = await transcribe({ audioPath, durationMs: media.durationMs });
    updateJob(job, { progress: { stage: "interpreting", percent: 82, detail: "把声音与画面放回同一条时间线。" } });
    const result = await analyze({ title: job.title, durationMs: media.durationMs, frames, transcript, framesDir });
    updateJob(job, { status: "done", result, progress: { stage: "done", percent: 100, detail: "分析已经完成。" } });
  } finally {
    await rm(inputPath, { force: true }).catch(() => undefined);
    await rm(audioPath, { force: true }).catch(() => undefined);
  }
}
