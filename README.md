<div align="center">
  <img src="public/koma-readme-icon.png" width="112" alt="Koma icon">
  <h1>Koma</h1>
  <p>AI-powered video understanding.</p>
  <p>
    <a href="README.zh-CN.md">简体中文</a>
  </p>
</div>

Upload a video or paste a URL. Koma extracts key frames, transcribes speech, and uses AI to explain the video — chapter by chapter — on a single jumpable timeline.

## Features

- **Video input** — upload local videos or analyze public URLs (Douyin, Bilibili, YouTube, and more via yt-dlp).
- **Chapter summary** — the AI splits the video into timed chapters, each with a title and a few sentences explaining what happens there. Click any chapter to jump straight to it.
- **Key-frame gallery** — scene-change detection picks the frames that matter, with uniform sampling to cover the whole video; larger cards show timestamps and open into a navigable full-size preview.
- **Subtitles** — timestamped transcription with optional speaker diarization (falls back gracefully if it fails).
- **Tags** — AI-generated content tags with timestamps that jump to the first appearance.
- **Timeline navigation** — jump from any chapter, tag, subtitle, or frame straight to that moment in the video.
- **Language-aware output** — titles, summaries, chapters, tags, and captions follow the UI language (English or Chinese).
- **Custom extraction** — provide a natural-language requirement and optional JSON example or JSON Schema; copy/download the result or retrieve the raw JSON through the API.
- **File artifacts** — generate ready-to-download JSON, CSV, Markdown, SRT, or TXT files from the same request; language and contents follow the analysis instruction.
- **Multiple AI backends** — presets for DashScope, OpenAI, Gemini, OpenRouter, and Groq, plus any OpenAI-compatible vision or transcription endpoint.
- **Protected admin console** — manage active ASR/vision providers, encrypted API keys, persistent jobs, and stored assets at `/admin`; running jobs keep an immutable provider snapshot.
- **Permanent replay** — every submission receives an unguessable `/jobs/<id>` link. SQLite/MySQL stores the job and complete result; local storage or Aliyun OSS stores the source video, frames, and generated files.
- **Smart downloads** — share links are resolved before downloading; overlong videos are rejected up front instead of after the whole file arrives.
- **Admin-only deletion** — public links are read-only; permanent deletion removes the database record and the entire job prefix from storage.

## Quick start

Requires Node.js 22.13+ and FFmpeg (bundled via `ffmpeg-static`).

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

Without any API keys, Koma runs the default summary flow with demo data; custom extraction requires a real vision model. Providers can be mixed: use DashScope for both stages, or pair Groq Whisper with OpenRouter's free vision router for a low-cost public demo (see [Configuration](docs/CONFIGURATION.md)).

## CLI

Analyze a video or URL from the terminal:

```bash
node dist-server/cli.js <video path or URL> [--lang en|zh] [--json out.json] [--frames-dir dir]
```

Extract requested data and emit only the target JSON:

```bash
node dist-server/cli.js demo.mp4 \
  --instruction "Extract every product, price, and first appearance time" \
  --schema product-shape.json \
  --artifact csv \
  --artifacts-dir outputs \
  --extraction-only
```

## Docs

- [Configuration](docs/CONFIGURATION.md) — environment variables
- [Administration](docs/ADMIN.md) — protected provider settings, database setup, and secret handling
- [HTTP API](docs/API.md) — submit jobs and retrieve structured results
- [Deployment](DEPLOY.md) — server setup with PM2 + nginx
- [Design decisions](docs/decisions/)
