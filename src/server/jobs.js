import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

const jobs = new Map();

export async function createJob({ source, title }) {
  const id = randomUUID();
  const dir = join(config.tempRoot, `ding-frame-${id}`);
  await mkdir(dir, { recursive: true });
  const now = Date.now();
  const job = {
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

export function getJob(id) {
  return jobs.get(id);
}

export function updateJob(job, patch) {
  Object.assign(job, patch);
  return job;
}

export function serializeJob(job) {
  if (!job) return null;
  const result = job.result && {
    ...job.result,
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

export async function purgeJob(id) {
  const job = jobs.get(id);
  if (!job) return false;
  jobs.delete(id);
  await rm(job.dir, { recursive: true, force: true });
  return true;
}

function scheduleExpiry(job) {
  const timer = setTimeout(() => purgeJob(job.id).catch(() => undefined), Math.max(1000, job.expiresAt - Date.now()));
  timer.unref?.();
}
