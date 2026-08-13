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
}

const jobs = new Map<string, Job>();

export async function createJob({ source, title }: { source: Job["source"]; title: string }): Promise<Job> {
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
    error: null
  };
  jobs.set(id, job);
  scheduleExpiry(job);
  return job;
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
  const job = jobs.get(id);
  jobs.delete(id);
  if (job) await rm(job.dir, { recursive: true, force: true }).catch(() => undefined);
}

function scheduleExpiry(job: Job): void {
  setTimeout(() => {
    if (jobs.get(job.id) === job) jobs.delete(job.id);
  }, Math.max(0, job.expiresAt - Date.now())).unref?.();
}
