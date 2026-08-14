<div align="center">
  <img src="public/koma-readme-icon.svg" width="112" alt="Koma icon">
  <h1>Koma</h1>
  <p>AI-powered video understanding.</p>
  <p>
    <a href="README.zh-CN.md">简体中文</a>
  </p>
</div>

Upload a video or paste a URL. Koma extracts key frames, transcribes speech, and uses AI to summarize the video and highlight important moments on a single timeline.

## Features

- **Video input** — upload local videos or analyze supported video URLs.
- **Subtitles** — timestamped transcription with optional speaker diarization.
- **Key moments** — summaries, tags, key frames, and highlights.
- **Timeline navigation** — jump directly to the relevant point in the video.
- **Temporary processing** — video and analysis data are cleaned up automatically.

## Quick start

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

See [Configuration](docs/CONFIGURATION.md), [Deployment](DEPLOY.md), and [Design decisions](docs/decisions/).
