# Configuration

Copy `.env.example` to `.env`. Most options are optional. Without model credentials, Koma can run with mock analysis data.

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

## Processing Pipeline

1. Resolve a supported video URL or accept a local upload.
2. Use FFmpeg to extract representative frames.
3. Transcribe audio with Fun-ASR and group word-level timestamps into subtitle lines.
4. Analyze frames and transcription with the configured vision model.
5. Delete intermediate audio and remove temporary data after the configured TTL.

## Supported Sites

Native parsing is available for Douyin and Bilibili (`BV` and `b23.tv` links).

When yt-dlp is installed, it is used as a fallback for sites such as YouTube, TikTok, Xiaohongshu, Weibo, and Tencent Video. Availability depends on the installed yt-dlp version and each site's anti-bot behavior.

Douyin image posts, login- or subscription-only content, and Kuaishou are not currently supported.
