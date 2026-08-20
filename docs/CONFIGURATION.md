# Configuration

Copy `.env.example` to `.env`. Without model credentials, Koma still runs the complete pipeline with mock data.

AI work is split into two independently configurable stages:

- `ASR_PROVIDER` turns audio into timestamped subtitles.
- `VISION_PROVIDER` combines key frames and subtitles into a title, summary, chapters, and tags.
- For a custom request, `VISION_PROVIDER` also produces `extractedData` in the requested JSON shape.

The two providers can be mixed; Koma is not tied to Qwen.

Mock mode demonstrates summaries, chapters, and the timeline without inventing business data. Custom extraction therefore requires a real vision provider.

## Provider presets

| Stage | Provider | Default model | Key |
| --- | --- | --- | --- |
| ASR | `dashscope` | `fun-asr-flash-2026-06-15` | `DASHSCOPE_API_KEY` |
| ASR | `groq` | `whisper-large-v3-turbo` | `GROQ_API_KEY` |
| ASR | `openai` | `whisper-1` | `OPENAI_API_KEY` |
| ASR | `openai-compatible` | custom | `ASR_API_KEY` |
| Vision | `dashscope` | `qwen3-vl-flash` | `DASHSCOPE_API_KEY` |
| Vision | `openai` | `gpt-4.1-mini` | `OPENAI_API_KEY` |
| Vision | `gemini` | `gemini-2.5-flash` | `GEMINI_API_KEY` |
| Vision | `openrouter` | `openrouter/free` | `OPENROUTER_API_KEY` |
| Vision | `groq` | `meta-llama/llama-4-scout-17b-16e-instruct` | `GROQ_API_KEY` |
| Vision | `openai-compatible` | custom | `VISION_API_KEY` |

Override any preset with `ASR_MODEL`, `VISION_MODEL`, `ASR_BASE_URL`, or `VISION_BASE_URL`. A provider model rename does not require a code change.

## Free-tier public demo

The repository includes `.env.demo.example`:

```bash
cp .env.demo.example .env
```

Add two server-side keys:

```dotenv
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
```

This combination uses:

- [Groq Speech to Text](https://console.groq.com/docs/speech-to-text) for multilingual Whisper transcription with segment timestamps. Koma's audio chunks stay below Groq's 25 MB free-tier per-file limit.
- [OpenRouter Free Models Router](https://openrouter.ai/openrouter/free), which selects a currently available free model capable of image input.

Free services still require account keys; there is no dependable anonymous, unlimited AI endpoint. Keys stay on the Koma server and never reach the browser. Because account-level quotas are limited, the demo template defaults to three-minute videos, three submissions per IP per UTC day, one concurrent job, and a ten-minute result TTL.

The built-in rate limiter is intended for a single-node demo. Multi-instance deployments should rate-limit at the gateway or in shared storage. Before setting `TRUST_PROXY=true` behind nginx, make sure the proxy overwrites client-supplied `X-Forwarded-For`.

## Common combinations

### DashScope for both stages

```dotenv
ASR_PROVIDER=dashscope
VISION_PROVIDER=dashscope
DASHSCOPE_API_KEY=...
```

### Groq transcription + OpenRouter free vision

```dotenv
ASR_PROVIDER=groq
GROQ_API_KEY=...
VISION_PROVIDER=openrouter
OPENROUTER_API_KEY=...
```

### Gemini vision + Groq transcription

```dotenv
ASR_PROVIDER=groq
GROQ_API_KEY=...
VISION_PROVIDER=gemini
GEMINI_API_KEY=...
```

### Any OpenAI-compatible service

```dotenv
ASR_PROVIDER=openai-compatible
ASR_API_KEY=...
ASR_BASE_URL=https://example.com/v1
ASR_MODEL=whisper-model

VISION_PROVIDER=openai-compatible
VISION_API_KEY=...
VISION_BASE_URL=https://example.com/v1
VISION_MODEL=vision-model
```

Vision services must support `POST /chat/completions` and `image_url`. Transcription services must support `POST /audio/transcriptions`, multipart uploads, and `verbose_json` segment timestamps.

## Variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Server port |
| `ASR_PROVIDER` | `mock` without a key | `mock`, `dashscope`, `groq`, `openai`, or `openai-compatible` |
| `ASR_API_KEY` | provider key | Custom/override transcription key |
| `ASR_BASE_URL` | provider preset | Custom/override transcription API URL |
| `ASR_MODEL` | provider preset | Transcription model |
| `VISION_PROVIDER` | `mock` without a key | `mock`, `dashscope`, `openai`, `gemini`, `openrouter`, `groq`, or `openai-compatible` |
| `VISION_API_KEY` | provider key | Custom/override vision key |
| `VISION_BASE_URL` | provider preset | Custom/override vision API URL |
| `VISION_MODEL` | provider preset | Vision-language model |
| `AI_TIMEOUT_MS` | `120000` | AI request timeout |
| `PUBLIC_BASE_URL` | empty | Public service URL; only needed by DashScope diarization |
| `ASR_DIARIZATION` | off / automatic | `on` or `off`; currently DashScope-only |
| `MAX_UPLOAD_BYTES` | `524288000` | Maximum upload size (500 MB) |
| `MAX_DURATION_SECONDS` | `900` | Maximum duration (15 minutes) |
| `FRAME_WIDTH` | `1280` | Key frame width |
| `FRAME_SCENE_THRESHOLD` | `0.4` | Scene-change threshold (0–1) |
| `MAX_FRAMES` | `18` | Maximum extracted key frames |
| `VISION_MAX_FRAMES` | `10` | Frames sent to vision; capped at five for Groq |
| `VISION_TRANSCRIPT_CHARS` | `30000` | Transcript characters sent to vision |
| `VISION_MAX_TOKENS` | `2000` | Vision output limit |
| `MAX_CONCURRENT_JOBS` | `2` | Concurrent analysis jobs |
| `RESULT_TTL_SECONDS` | `1200` | Result retention time |
| `DEMO_REQUESTS_PER_IP_PER_DAY` | `0` | Single-node daily submissions per IP; 0 disables it |
| `TRUST_PROXY` | `false` | Trust the reverse proxy's client IP |

Legacy `ANALYSIS_PROVIDER=openai-compatible` remains accepted, but new deployments should use `VISION_PROVIDER`.

## Processing pipeline

1. Resolve a supported video URL or accept a local upload.
2. Use FFmpeg to extract representative frames.
3. Transcribe audio with the selected ASR provider.
4. Analyze key frames and subtitles with the selected vision provider.
5. Delete intermediate audio and remove temporary data after the configured TTL.

## Supported sites

Native parsing is available for Douyin and Bilibili (`BV` and `b23.tv` links).

When yt-dlp is installed, it is used as a fallback for sites such as YouTube, TikTok, Xiaohongshu, Weibo, and Tencent Video. Availability depends on the installed yt-dlp version and each site's anti-bot behavior.

Douyin image posts, login- or subscription-only content, and Kuaishou are not currently supported.
