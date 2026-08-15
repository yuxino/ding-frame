import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { analyze } from "./analysis.js";
import { transcribe, transcribeFullAudio } from "./asr.js";
import { downloadUrl } from "./download.js";
import { getJobAbortSignal, updateJob, type AnalysisResult, type Job, type JobProgress } from "./jobs.js";
import { resolveVideoUrl } from "./resolver.js";
import { createSemaphore } from "./semaphore.js";
import { extractAudioSegments, extractFrames, inspectVideo } from "./video.js";

// 限制同时运行的分析任务数，超出部分排队等待。
// 多个大视频同时抽帧/转写会吃满 CPU 和内存，这里把它们串成有限并发。
const analysisSlots = createSemaphore(config.maxConcurrentJobs);

export function enqueueAnalysis(job: Job): void {
  setImmediate(async () => {
    const signal = getJobAbortSignal(job.id);
    if (signal?.aborted) return;
    await analysisSlots.acquire();
    try {
      if (signal?.aborted) return;
      await runAnalysis(job, signal);
    } catch (error) {
      // 用户取消或任务到期导致的 AbortError 不算失败，直接静默收尾。
      if (signal?.aborted) return;
      updateJob(job, { status: "failed", error: error instanceof Error ? error.message : String(error), progress: { stage: "failed", percent: 100, detail: error instanceof Error ? error.message : String(error) } });
    } finally {
      analysisSlots.release();
    }
  });
}

interface AnalyzeMediaOptions {
  inputPath: string;
  title: string;
  framesDir: string;
  audioDir: string;
  signal?: AbortSignal;
  language?: "en" | "zh";
  onProgress?: (progress: JobProgress) => void;
}

// 与 job 解耦的媒体分析管线，HTTP 任务与 headless CLI 共用。
// 输入文件与帧目录的生命周期由调用方负责；音频切片作为中间产物在这里即时清理。
export async function analyzeMedia({ inputPath, title, framesDir, audioDir, signal, language = "zh", onProgress = () => {} }: AnalyzeMediaOptions): Promise<AnalysisResult> {
  onProgress({ stage: "inspecting", percent: 12, detail: "正在读取视频尺寸和时长。" });
  const media = await inspectVideo(inputPath, { signal });
  if (!media.hasVideo) throw new Error("这个文件里没有视频画面，请换一个带画面的视频。");

  throwIfAborted(signal);
  onProgress({ stage: "extracting_frames", percent: 30, detail: "从视频里挑出几个视觉切片。" });
  const frames = await extractFrames(inputPath, framesDir, { signal, durationMs: media.durationMs });

  throwIfAborted(signal);
  onProgress({ stage: "extracting_audio", percent: 46, detail: "把声音整理成适合听写的轨道。" });
  await mkdir(audioDir, { recursive: true });
  let transcript: Awaited<ReturnType<typeof transcribe>> = [];
  if (media.hasAudio) {
    if (config.asrDiarization && config.asrProvider === "dashscope") {
      onProgress({ stage: "transcribing", percent: 60, detail: "正在做说话人分离与听写。" });
      try {
        transcript = await transcribeFullAudio({ inputPath, audioDir, publicBaseUrl: config.publicBaseUrl, signal });
      } catch (error) {
        // 说话人分离只是给字幕加“说话人”标签的增强：它依赖公网地址和百炼异步任务，
        // 失败时降级为普通分段听写，保证字幕和总结仍然可用，而不是让整个分析失败。
        if (signal?.aborted) throw error;
        console.warn(`[koma] 说话人分离失败，降级为普通听写：${error instanceof Error ? error.message : String(error)}`);
        transcript = await transcribeSegments(inputPath, audioDir, media.durationMs, signal, onProgress);
      }
    } else {
      transcript = await transcribeSegments(inputPath, audioDir, media.durationMs, signal, onProgress);
    }
  } else {
    onProgress({ stage: "transcribing", percent: 65, detail: "视频没有声音，继续理解画面。" });
  }

  throwIfAborted(signal);
  onProgress({ stage: "interpreting", percent: 82, detail: "把声音与画面放回同一条时间线。" });
  const result = await analyze({ title, durationMs: media.durationMs, frames, transcript, framesDir, signal, language });
  result.hasSubtitles = Boolean(result.hasSubtitles || media.hasNativeSubtitles);
  await rm(audioDir, { recursive: true, force: true }).catch(() => undefined);
  return result;
}

// 普通分段听写：把音频切成段交给同步 Fun-ASR-Flash（base64 直传，无需公网地址）。
async function transcribeSegments(
  inputPath: string,
  audioDir: string,
  durationMs: number,
  signal: AbortSignal | undefined,
  onProgress: (progress: JobProgress) => void
): Promise<Awaited<ReturnType<typeof transcribe>>> {
  const audioSegments = await extractAudioSegments(inputPath, audioDir, durationMs, { signal });
  throwIfAborted(signal);
  onProgress({ stage: "transcribing", percent: 65, detail: config.asrProvider === "mock" ? "演示听写正在生成。" : "Fun-ASR 正在生成逐句字幕。" });
  return audioSegments.length ? await transcribe({ audioSegments, durationMs, signal }) : [];
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("分析已取消。", "AbortError");
}

async function runAnalysis(job: Job, signal?: AbortSignal): Promise<void> {
  const framesDir = join(job.dir, "frames");
  const audioDir = join(job.dir, "audio");
  let completed = false;
  let inputPath: string | undefined = job.inputPath;
  try {
    updateJob(job, { status: "processing" });
    if (job.sourceUrl) {
      // 视频地址任务：在后台解析真实地址并下载，全程回报进度，提交接口不再阻塞
      const resolved = await resolveVideoUrl(job.sourceUrl, { signal });
      if (resolved.title) updateJob(job, { title: resolved.title });
      throwIfAborted(signal);
      updateJob(job, { progress: { stage: "downloading", percent: 8, detail: "正在把视频放入临时空间。" } });
      inputPath = join(job.dir, "input.mp4");
      job.inputPath = inputPath;
      const download = await downloadUrl(resolved.url, inputPath, {
        referer: resolved.referer,
        signal,
        onProgress: (percent, detail) => updateJob(job, { progress: { stage: "downloading", percent, detail } })
      });
      job.inputMimeType = download.contentType;
    }
    if (!inputPath) throw new Error("视频文件尚未就绪。");
    const result = await analyzeMedia({
      inputPath,
      title: job.title,
      framesDir,
      audioDir,
      signal,
      language: job.language,
      onProgress: (progress) => updateJob(job, { progress })
    });
    updateJob(job, { status: "done", result, progress: { stage: "done", percent: 100, detail: "分析已经完成。" } });
    completed = true;
  } finally {
    // 成功时保留原视频与抽帧供结果页回看，等 TTL 到期整体清除；
    // 失败时中间产物没有展示价值，连同音频一起立即清理。
    if (!completed && inputPath) {
      await rm(inputPath, { force: true }).catch(() => undefined);
      await rm(framesDir, { recursive: true, force: true }).catch(() => undefined);
    }
    await rm(audioDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
