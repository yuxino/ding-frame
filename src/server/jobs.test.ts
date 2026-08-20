import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

const baseRoot = await mkdtemp(join(os.tmpdir(), "koma-jobs-test-"));

// 每个用例用独立的 TEMP_ROOT 重新加载模块，隔离任务目录，避免用例互相污染。
async function loadJobs() {
  vi.stubEnv("TEMP_ROOT", await mkdtemp(join(baseRoot, "run-")));
  vi.resetModules();
  return await import("./jobs.js");
}

afterAll(async () => {
  await rm(baseRoot, { recursive: true, force: true }).catch(() => undefined);
});

describe("job lifecycle cleanup", () => {
  it("createJob creates its working directory and registers the job", async () => {
    const { createJob, expireJob, getJob } = await loadJobs();
    const job = await createJob({ source: "upload", title: "a.mp4" });
    await expect(stat(job.dir)).resolves.toBeTruthy();
    expect(getJob(job.id)).toBe(job);
    await expireJob(job.id);
  });

  it("stores and serializes a custom analysis specification", async () => {
    const { createJob, expireJob, serializeJob } = await loadJobs();
    const analysisSpec = { instruction: "提取商品", outputSchema: { products: [] } };
    const job = await createJob({ source: "upload", title: "a.mp4", analysisSpec });
    expect(job.analysisSpec).toEqual(analysisSpec);
    expect(serializeJob(job)?.analysisSpec).toEqual(analysisSpec);
    await expireJob(job.id);
  });

  it("serializes artifact metadata without embedding file content", async () => {
    const { createJob, expireJob, serializeJob, updateJob } = await loadJobs();
    const job = await createJob({ source: "upload", title: "a.mp4" });
    updateJob(job, {
      status: "done",
      result: {
        title: "report",
        durationMs: 1000,
        summary: "summary",
        tags: [],
        chapters: [],
        transcript: [],
        frames: [],
        artifacts: [{ id: "0", name: "report.md", format: "markdown", mimeType: "text/markdown; charset=utf-8", content: "# report", sizeBytes: 8 }]
      }
    });
    const serialized = serializeJob(job) as { result?: { artifacts?: Array<Record<string, unknown>> } };
    expect(serialized.result?.artifacts?.[0]).toMatchObject({ name: "report.md", downloadUrl: `/api/jobs/${job.id}/artifacts/0` });
    expect(serialized.result?.artifacts?.[0]).not.toHaveProperty("content");
    await expireJob(job.id);
  });

  it("purgeJob removes the job directory from disk", async () => {
    const { createJob, getJob, purgeJob } = await loadJobs();
    const job = await createJob({ source: "upload", title: "a.mp4" });
    await writeFile(join(job.dir, "input.mp4"), "video");
    await purgeJob(job.id);
    expect(getJob(job.id)).toBeUndefined();
    await expect(stat(job.dir)).rejects.toThrow();
  });

  it("expireJob removes the job directory, matching the TTL cleanup path", async () => {
    const { createJob, expireJob, getJob } = await loadJobs();
    const job = await createJob({ source: "url", title: "https://example.com/a.mp4" });
    await writeFile(join(job.dir, "input.mp4"), "video");
    await expireJob(job.id);
    expect(getJob(job.id)).toBeUndefined();
    await expect(stat(job.dir)).rejects.toThrow();
  });

  it("expireJob aborts the job's signal so in-flight pipelines stop", async () => {
    const { createJob, expireJob, getJobAbortSignal } = await loadJobs();
    const job = await createJob({ source: "upload", title: "a.mp4" });
    const signal = getJobAbortSignal(job.id);
    expect(signal?.aborted).toBe(false);
    await expireJob(job.id);
    expect(signal?.aborted).toBe(true);
  });

  it("expiring an unknown job is a no-op", async () => {
    const { expireJob } = await loadJobs();
    await expect(expireJob("does-not-exist")).resolves.toBeUndefined();
  });

  it("purgeJob triggers abort too, so a deleted job stops processing", async () => {
    const { createJob, getJobAbortSignal, purgeJob } = await loadJobs();
    const job = await createJob({ source: "upload", title: "a.mp4" });
    const signal = getJobAbortSignal(job.id);
    await purgeJob(job.id);
    expect(signal?.aborted).toBe(true);
    await expect(stat(job.dir)).rejects.toThrow();
  });
});
