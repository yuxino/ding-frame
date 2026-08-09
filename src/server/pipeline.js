import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { analyze } from "./analysis.js";
import { transcribe } from "./asr.js";
import { updateJob } from "./jobs.js";
import { extractAudioSegments, extractFrames, inspectVideo } from "./video.js";

export function enqueueAnalysis(job) {
  setImmediate(() => runAnalysis(job).catch((error) => {
    updateJob(job, { status: "failed", error: error.message, progress: { stage: "failed", percent: 100, detail: error.message } });
  }));
}

// 与 job 解耦的媒体分析管线，HTTP 任务与 headless CLI 共用。
// 输入文件与帧目录的生命周期由调用方负责；音频切片作为中间产物在这里即时清理。
export async function analyzeMedia({ inputPath, title, framesDir, audioDir, onProgress = () => {} }) {
  onProgress({ stage: "inspecting", percent: 12, detail: "正在读取视频尺寸和时长。" });
  const media = await inspectVideo(inputPath);
  if (!media.hasVideo) throw new Error("这个文件里没有视频画面，请换一个带画面的视频。");

  onProgress({ stage: "extracting_frames", percent: 30, detail: "从视频里挑出几个视觉切片。" });
  const frames = await extractFrames(inputPath, framesDir);

  onProgress({ stage: "extracting_audio", percent: 46, detail: "把声音整理成适合听写的轨道。" });
  await mkdir(audioDir, { recursive: true });
  const audioSegments = media.hasAudio
    ? await extractAudioSegments(inputPath, audioDir, media.durationMs)
    : [];

  onProgress({ stage: "transcribing", percent: 65, detail: !media.hasAudio ? "视频没有声音，继续理解画面。" : config.asrProvider === "mock" ? "演示听写正在生成。" : "千问 ASR 正在听写人声。" });
  const transcript = audioSegments.length
    ? await transcribe({ audioSegments, durationMs: media.durationMs })
    : [];

  onProgress({ stage: "interpreting", percent: 82, detail: "把声音与画面放回同一条时间线。" });
  const result = await analyze({ title, durationMs: media.durationMs, frames, transcript, framesDir });
  await rm(audioDir, { recursive: true, force: true }).catch(() => undefined);
  return result;
}

async function runAnalysis(job) {
  const inputPath = job.inputPath;
  const framesDir = join(job.dir, "frames");
  const audioDir = join(job.dir, "audio");
  let completed = false;
  try {
    updateJob(job, { status: "processing" });
    const result = await analyzeMedia({
      inputPath,
      title: job.title,
      framesDir,
      audioDir,
      onProgress: (progress) => updateJob(job, { progress })
    });
    updateJob(job, { status: "done", result, progress: { stage: "done", percent: 100, detail: "分析已经完成。" } });
    completed = true;
  } finally {
    // 成功时保留原视频与抽帧供结果页回看，等 TTL 到期整体清除；
    // 失败时中间产物没有展示价值，连同音频一起立即清理。
    if (!completed) {
      await rm(inputPath, { force: true }).catch(() => undefined);
      await rm(framesDir, { recursive: true, force: true }).catch(() => undefined);
    }
    await rm(audioDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
