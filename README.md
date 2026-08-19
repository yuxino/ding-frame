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
- **Key frames** — scene-change detection picks the frames that matter, with uniform sampling to cover the whole video; click a thumbnail to preview the full frame.
- **Subtitles** — timestamped transcription with optional speaker diarization (falls back gracefully if it fails).
- **Tags** — AI-generated content tags with timestamps that jump to the first appearance.
- **Timeline navigation** — jump from any chapter, tag, subtitle, or frame straight to that moment in the video.
- **Language-aware output** — titles, summaries, chapters, tags, and captions follow the UI language (English or Chinese).
- **Smart downloads** — share links are resolved before downloading; overlong videos are rejected up front instead of after the whole file arrives.
- **Temporary processing** — video and analysis data are cleaned up automatically after the TTL.

## Quick start

Requires Node.js 20+ and FFmpeg (bundled via `ffmpeg-static`).

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

Without any API keys, Koma runs the full flow with demo data. Configure an Alibaba Cloud Model Studio API key for real ASR and vision analysis (see [Configuration](docs/CONFIGURATION.md)).

## CLI

Analyze a video or URL from the terminal:

```bash
node dist-server/cli.js <video path or URL> [--lang en|zh] [--json out.json] [--frames-dir dir]
```

## Docs

- [Configuration](docs/CONFIGURATION.md) — environment variables
- [Deployment](DEPLOY.md) — server setup with PM2 + nginx
- [Design decisions](docs/decisions/)
