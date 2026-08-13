# Koma

[English](README.md) | [简体中文](README.zh-CN.md)

AI-powered video understanding.

Upload a video or paste a URL. Koma extracts key frames, transcribes speech, and uses AI to summarize the video and identify important moments on a single timeline.

## Features

- Local video upload and URL analysis
- Douyin and Bilibili URL parsing, with yt-dlp fallback
- Timestamped subtitles and optional speaker diarization
- AI summaries, tags, key frames, and highlights
- Direct timestamp navigation from analysis results
- Automatic cleanup of temporary video and analysis data

## Quick Start

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Tech Stack

TypeScript · Fastify · React · Vite · FFmpeg · Fun-ASR · Qwen-VL

## Documentation

- [Configuration and supported sites](docs/CONFIGURATION.md)
- [Deployment](DEPLOY.md)
- [Design decisions](docs/decisions/)
