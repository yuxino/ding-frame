# Video Analysis MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a small-video, ephemeral Node.js application that accepts local files or direct video URLs, extracts frames, transcribes audio, and displays a temporary timeline result.

**Architecture:** A Fastify API streams inputs into an OS temp directory, runs FFmpeg, calls pluggable mock/Alibaba ASR and vision adapters, stores only in-memory job metadata plus temporary frames, and serves a React/Vite frontend from the same container.

**Tech Stack:** Node.js 22, Fastify 5, React 19, Vite 7, FFmpeg, Aliyun OSS + Paraformer adapter, GitHub Actions, Docker, Aliyun ECS/ACR.

---

### Task 1: Establish project and frontend shell

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`
- Create: `src/client/main.jsx`, `src/client/App.jsx`, `src/client/styles.css`
- Create: `.gitignore`, `.env.example`

**Step 1:** Install dependencies with `npm install`.

**Step 2:** Run `npm run build` and verify Vite emits `dist/index.html`.

**Step 3:** Run `npm run dev`, open the landing page, and verify both local-file and URL tabs render.

### Task 2: Implement ephemeral jobs and media pipeline

**Files:**
- Create: `src/server/config.js`, `src/server/jobs.js`, `src/server/video.js`, `src/server/pipeline.js`
- Create: `src/server/index.js`

**Step 1:** Add tests for command execution and result shaping in `src/server/video.test.js` and `src/server/analysis.test.js`.

**Step 2:** Run `npm test` and verify the tests pass.

**Step 3:** Implement stream-to-temp upload, direct URL download, FFmpeg frame/audio extraction, progress updates, frame serving, and TTL cleanup.

**Step 4:** Run `npm test && npm run build`; verify no test or build failure.

### Task 3: Add model adapters

**Files:**
- Create: `src/server/asr.js`, `src/server/analysis.js`
- Modify: `.env.example`, `README.md`

**Step 1:** Keep mock providers as the zero-configuration path.

**Step 2:** Add the Paraformer async submission/polling flow, temporary OSS upload, signed URL, and post-task object deletion.

**Step 3:** Add the optional OpenAI-compatible vision call, sending a small capped set of frames and transcript context.

**Step 4:** Run `npm test`; with no credentials, verify the mock provider remains selected.

### Task 4: Add CI and Aliyun deployment handoff

**Files:**
- Create: `Dockerfile`
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy-aliyun.yml`
- Create: `docs/decisions/0001-ephemeral-processing.md`

**Step 1:** Build the Docker image locally.

**Step 2:** Run the container with the mock configuration and call `/api/health`.

**Step 3:** Configure GitHub secrets and the ECS `/etc/between-frames/.env` file when the repository and server details are available.
