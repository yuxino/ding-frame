import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import type { TranscriptLine } from "./types.js";
export type { TranscriptLine };

export interface Frame {
  filename: string;
  atMs: number;
  caption?: string;
  path?: string;
}

export interface Highlight {
  atMs: number;
  title: string;
  detail: string;
}

export interface Tag {
  label: string;
  category: string;
  atMs: number;
}

export interface AnalysisResult {
  title: string;
  durationMs: number;
  summary: string;
  tags: Tag[];
  highlights: Highlight[];
  transcript: TranscriptLine[];
  hasSubtitles?: boolean;
  frames: Frame[];
}

export interface JobProgress {
  stage: string;
  percent: number;
  detail: string;
}

export interface Job {
  id: string;
  dir: string;
  source: "upload" | "url";
  sourceUrl?: string;
  title: string;
  createdAt: number;
  expiresAt: number;
  status: "queued" | "processing" | "done" | "failed";
  progress: JobProgress;
  result: AnalysisResult | null;
  error: string | null;
  inputPath?: string;
  inputMimeType?: string;
  /** 分析结果的语言：标题、总结、标签等 AI 生成文案按此语言输出。 */
  language: "en" | "zh";
}

const jobs = new Map<string, Job>();
// 每个任务的取消信号：purgeJob 或到期清理时触发，让正在跑的管线尽快停下来。
const abortControllers = new Map<string, AbortController>();

export async function createJob({ source, title, language = "zh" }: { source: Job["source"]; title: string; language?: "en" | "zh" }): Promise<Job> {
  const id = randomUUID();
  const dir = join(config.tempRoot, `koma-${id}`);
  await mkdir(dir, { recursive: true });
  const now = Date.now();
  const job: Job = {
    id,
    dir,
    source,
    title: title || "未命名视频",
    createdAt: now,
    expiresAt: now + config.resultTtlSeconds * 1000,
    status: "queued",
    progress: { stage: "queued", percent: 4, detail: "视频已经放入临时空间。" },
    result: null,
    error: null,
    language
  };
  jobs.set(id, job);
  abortControllers.set(id, new AbortController());
  scheduleExpiry(job);
  return job;
}

export function getJobAbortSignal(id: string): AbortSignal | undefined {
  return abortControllers.get(id)?.signal;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJob(job: Job, patch: Partial<Job>): Job {
  Object.assign(job, patch);
  return job;
}

export function serializeJob(job: Job | undefined) {
  if (!job) return null;
  const result = job.result && {
    ...job.result,
    videoUrl: `/api/jobs/${job.id}/video`,
    frames: job.result.frames.map((frame) => ({
      ...frame,
      url: `/api/jobs/${job.id}/frames/${encodeURIComponent(frame.filename)}`
    }))
  };
  return {
    id: job.id,
    source: job.source,
    title: job.title,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
    status: job.status,
    progress: job.progress,
    result,
    error: job.error
  };
}

export async function purgeJob(id: string): Promise<void> {
  await expireJob(id);
}

// 清除任务：触发取消信号、移除内存记录、删除磁盘目录。
// 同时被 purgeJob 和到期定时器使用，保证两种路径都清理干净。
export async function expireJob(id: string): Promise<void> {
  const job = jobs.get(id);
  abortControllers.get(id)?.abort();
  abortControllers.delete(id);
  jobs.delete(id);
  if (job) await rm(job.dir, { recursive: true, force: true }).catch(() => undefined);
}

function scheduleExpiry(job: Job): void {
  setTimeout(() => {
    // 到期时不仅要清掉内存记录，还要把磁盘上的视频、抽帧和中间产物一起删掉，
    // 兑现“20 分钟后自动消失”的承诺，避免临时目录无限堆积。
    expireJob(job.id).catch(() => undefined);
  }, Math.max(0, job.expiresAt - Date.now())).unref?.();
}
