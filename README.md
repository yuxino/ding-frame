# Ding Frame

[English](README.md) | [简体中文](README.zh-CN.md)

Ding Frame is a temporary workspace for analyzing short videos. It accepts local files or video URLs, extracts representative frames, transcribes speech into timestamped subtitles, identifies important moments, and puts everything on a single timeline.

Video files and analysis results are temporary by design. Intermediate audio is deleted after processing, and stored videos, frames, and results are removed after the configured TTL (20 minutes by default).

## Features

- Upload local videos or analyze video URLs
- Native URL parsing for Douyin and Bilibili, with yt-dlp as a fallback for other supported sites
- Timestamped subtitles generated from ASR word-level timestamps
- Optional speaker diarization when a public service URL is configured
- AI-generated summaries, tags, key frames, and notable moments
- Jump directly to a timestamp from subtitles, tags, frames, or highlights
- Automatic cleanup of intermediate audio and temporary analysis data
- Simple in-memory task storage suitable for lightweight deployments

## Quick Start

Requires Node.js 20+ (Node.js 22 recommended).

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

For a production build:

```bash
npm run check
npm start
```

You can also analyze a video from the command line:

```bash
node dist-server/cli.js ./demo.mp4
node dist-server/cli.js https://www.bilibili.com/video/BV1xxx --json result.json --frames-dir ./frames
```

## Configuration

Copy `.env.example` to `.env`. Most options are optional; without model credentials the application can run with mock analysis data.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Server port |
| `DASHSCOPE_API_KEY` | empty | Alibaba Cloud Model Studio API key for ASR and vision models |
| `ASR_PROVIDER` | `dashscope` | ASR provider; falls back to `mock` without credentials |
| `ASR_MODEL` | `fun-asr-flash-2026-06-15` | ASR model used for subtitles |
| `ANALYSIS_PROVIDER` | `openai-compatible` | Vision analysis provider; falls back to `mock` without credentials |
| `VISION_MODEL` | `qwen3-vl-flash` | Vision-language model |
| `PUBLIC_BASE_URL` | empty | Public service URL; enables speaker diarization when configured |
| `ASR_DIARIZATION` | `auto` | Speaker diarization mode: `on`, `off`, or `auto` |
| `MAX_UPLOAD_BYTES` | `524288000` | Maximum upload size (500 MB) |
| `MAX_DURATION_SECONDS` | `900` | Maximum video duration (15 minutes) |
| `RESULT_TTL_SECONDS` | `1200` | Result retention time (20 minutes) |

## How It Works

1. **Acquire video** — resolve a supported URL or accept a local upload.
2. **Extract frames** — FFmpeg samples representative frames from the video.
3. **Transcribe audio** — Fun-ASR generates word-level timestamps, which are grouped into subtitle lines.
4. **Analyze content** — the vision model uses frames and transcription to produce a title, summary, tags, and highlights.
5. **Clean up** — intermediate audio is deleted immediately; videos, frames, and results are removed when the TTL expires or when manually cleared.

## Supported Sites

- **Native:** Douyin and Bilibili (`BV` and `b23.tv` links)
- **yt-dlp fallback:** YouTube, TikTok, Xiaohongshu, Weibo, Tencent Video, and other sites supported by yt-dlp
- **Not currently supported:** Douyin image posts, login- or subscription-only content, and Kuaishou

Fallback availability depends on the installed yt-dlp version and each site's anti-bot behavior.

## Tech Stack

TypeScript · Node.js 22 · Fastify 5 · React 19 · Vite 7 · FFmpeg · Vitest · Alibaba Cloud Model Studio (Fun-ASR / Qwen-VL)

## Project Structure

```text
src/
  server/   # Fastify API, URL parsing, ASR, vision analysis, download pipeline
  client/   # React frontend
docs/       # Design and decision records
DEPLOY.md   # Deployment guide
```

## Deployment

For a regular Linux server, build the project and deploy `dist/`, `dist-server/`, and the package files. Install production dependencies and run `node dist-server/index.js` with a process manager such as systemd or PM2. See [DEPLOY.md](DEPLOY.md) for an example setup.

Docker is also supported:

```bash
docker build -t ding-frame .
docker run -p 3000:3000 ding-frame
```

## License

See the repository license for details.
