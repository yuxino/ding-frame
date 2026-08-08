# No-Bucket Production Finish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish 盯帧 as an ephemeral small-video analyzer that uses Alibaba Cloud Model Studio without OSS and is ready for GitHub CI and Aliyun ECS deployment.

**Architecture:** FFmpeg extracts short MP3 audio segments and JPEG frames into one per-job temporary directory. Qwen3-ASR-Flash receives each audio segment as a Base64 data URI, Qwen3-VL-Flash receives capped Base64 frames plus the transcript, and the server removes source/audio immediately and the remaining result directory on TTL expiry.

**Tech Stack:** Node.js 22, Fastify 5, React 19, Vite 7, FFmpeg, Qwen3-ASR-Flash, Qwen3-VL-Flash, Docker, GitHub Actions, Aliyun ECS/ACR.

---

### Task 1: Replace OSS ASR with direct Base64 ASR

**Files:**
- Modify: `src/server/asr.js`
- Modify: `src/server/config.js`
- Modify: `src/server/video.js`
- Modify: `src/server/pipeline.js`
- Test: `src/server/asr.test.js`
- Test: `src/server/video.test.js`

**Steps:**
1. Add failing tests for the Qwen3-ASR request and segment timestamps.
2. Add temporary MP3 segment extraction and Qwen3-ASR-Flash Base64 requests.
3. Remove OSS configuration and the `ali-oss` dependency.
4. Run the focused tests and the full test suite.

### Task 2: Harden the real visual-summary result

**Files:**
- Modify: `src/server/analysis.js`
- Test: `src/server/analysis.test.js`

**Steps:**
1. Add tests for fenced/plain JSON model responses and malformed highlights.
2. Normalize model output so the result page always receives safe summary, frames, transcript, and timeline fields.
3. Run the focused tests.

### Task 3: Align docs and deployment with 盯帧

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/plans/2026-08-09-video-analysis-design.md`
- Modify: `docs/decisions/0001-ephemeral-processing.md`
- Modify: `.github/workflows/deploy-aliyun.yml`

**Steps:**
1. Document one-key, no-Bucket setup and free-quota-only safeguards.
2. Rename deployment image, container, and ECS config path to `ding-frame`.
3. Verify no OSS/Paraformer/old project-name references remain.

### Task 4: End-to-end verification and publication

**Files:**
- Verify: all project files

**Steps:**
1. Run tests, build, and Docker build.
2. Start production mode and verify health, upload, URL, progress, result, and deletion flows.
3. Inspect the frontend in the browser at desktop and narrow widths.
4. Commit the finished project and push it to GitHub; report any external credential or server-secret blocker precisely.
