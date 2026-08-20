# 配置

复制 `.env.example` 为 `.env`。不配置模型凭证时，Koma 会使用 mock 数据跑通完整流程。

Koma 把 AI 分成两个独立阶段：

- `ASR_PROVIDER` 负责把声音转成带时间戳的字幕。
- `VISION_PROVIDER` 负责结合关键帧和字幕生成标题、总结、章节与标签。
- 用户填写自定义分析要求时，`VISION_PROVIDER` 还会按目标 JSON 结构生成 `extractedData`。

两者可以任意组合，不再绑定 Qwen。

默认 mock 模式可以演示总结、章节和时间线，但不会伪造结构化业务数据；按要求提取必须配置真实视觉模型。

## Provider 预设

| 阶段 | Provider | 默认模型 | Key |
| --- | --- | --- | --- |
| ASR | `dashscope` | `fun-asr-flash-2026-06-15` | `DASHSCOPE_API_KEY` |
| ASR | `groq` | `whisper-large-v3-turbo` | `GROQ_API_KEY` |
| ASR | `openai` | `whisper-1` | `OPENAI_API_KEY` |
| ASR | `openai-compatible` | 自定义 | `ASR_API_KEY` |
| 视觉 | `dashscope` | `qwen3-vl-flash` | `DASHSCOPE_API_KEY` |
| 视觉 | `openai` | `gpt-4.1-mini` | `OPENAI_API_KEY` |
| 视觉 | `gemini` | `gemini-2.5-flash` | `GEMINI_API_KEY` |
| 视觉 | `openrouter` | `openrouter/free` | `OPENROUTER_API_KEY` |
| 视觉 | `groq` | `meta-llama/llama-4-scout-17b-16e-instruct` | `GROQ_API_KEY` |
| 视觉 | `openai-compatible` | 自定义 | `VISION_API_KEY` |

所有预设都能通过 `ASR_MODEL`、`VISION_MODEL`、`ASR_BASE_URL` 和 `VISION_BASE_URL` 覆盖。模型下线或厂商改名时不需要改代码。

## 免费额度演示

仓库提供了 `.env.demo.example`：

```bash
cp .env.demo.example .env
```

然后在服务器端填写：

```dotenv
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
```

这个组合使用：

- [Groq Speech to Text](https://console.groq.com/docs/speech-to-text)：Whisper 多语言转写，返回 segment 时间戳；Koma 的音频切片小于其免费档 25 MB 单文件限制。
- [OpenRouter Free Models Router](https://openrouter.ai/openrouter/free)：自动选择当前支持图片输入的免费模型。

免费服务仍然要求账户 Key，没有可信的“匿名无限免费”AI 接口。Key 只放在 Koma 服务端，浏览器不会拿到。免费额度会受账户级请求限制影响，因此演示模板默认限制：

- 视频最长 3 分钟；
- 单 IP 每个 UTC 日 3 次；
- 同时只分析 1 个任务；
- 结果 10 分钟后清理。

内置限流适合单机演示，多实例部署应在网关或共享存储中统一限流。nginx 后设置 `TRUST_PROXY=true` 前，必须确认代理会覆盖客户端伪造的 `X-Forwarded-For`。

## 常用组合

### 只用百炼

```dotenv
ASR_PROVIDER=dashscope
VISION_PROVIDER=dashscope
DASHSCOPE_API_KEY=...
```

### Groq 听写 + OpenRouter 免费视觉模型

```dotenv
ASR_PROVIDER=groq
GROQ_API_KEY=...
VISION_PROVIDER=openrouter
OPENROUTER_API_KEY=...
```

### Gemini 视觉 + Groq 听写

```dotenv
ASR_PROVIDER=groq
GROQ_API_KEY=...
VISION_PROVIDER=gemini
GEMINI_API_KEY=...
```

### 任意 OpenAI-compatible 服务

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

视觉服务需要兼容 `POST /chat/completions` 和 `image_url`；听写服务需要兼容 `POST /audio/transcriptions`、multipart 上传和 `verbose_json` segment 时间戳。

## 全部变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务端口 |
| `ASR_PROVIDER` | `mock`（无 Key 时） | `mock`、`dashscope`、`groq`、`openai` 或 `openai-compatible` |
| `ASR_API_KEY` | Provider 对应 Key | 自定义或覆盖预设的听写 Key |
| `ASR_BASE_URL` | Provider 预设 | 自定义或覆盖听写 API 地址 |
| `ASR_MODEL` | Provider 预设 | 听写模型 |
| `VISION_PROVIDER` | `mock`（无 Key 时） | `mock`、`dashscope`、`openai`、`gemini`、`openrouter`、`groq` 或 `openai-compatible` |
| `VISION_API_KEY` | Provider 对应 Key | 自定义或覆盖预设的视觉 Key |
| `VISION_BASE_URL` | Provider 预设 | 自定义或覆盖视觉 API 地址 |
| `VISION_MODEL` | Provider 预设 | 视觉语言模型 |
| `AI_TIMEOUT_MS` | `120000` | AI 请求超时 |
| `PUBLIC_BASE_URL` | 空 | 服务公网地址；仅 DashScope 说话人分离需要 |
| `ASR_DIARIZATION` | `off` / 自动 | `on`、`off`；目前仅 DashScope 支持 |
| `MAX_UPLOAD_BYTES` | `524288000` | 最大上传大小（500 MB） |
| `MAX_DURATION_SECONDS` | `900` | 视频最长时长（15 分钟） |
| `FRAME_WIDTH` | `1280` | 关键帧宽度 |
| `FRAME_SCENE_THRESHOLD` | `0.4` | 场景变化阈值（0–1） |
| `MAX_FRAMES` | `18` | 关键帧数量上限 |
| `VISION_MAX_FRAMES` | `10` | 发给视觉模型的代表帧数；Groq 自动限制为最多 5 张 |
| `VISION_TRANSCRIPT_CHARS` | `30000` | 发给视觉模型的字幕字符上限 |
| `VISION_MAX_TOKENS` | `2000` | 视觉模型输出上限 |
| `MAX_CONCURRENT_JOBS` | `2` | 同时分析的任务数 |
| `RESULT_TTL_SECONDS` | `1200` | 结果保留时间 |
| `DEMO_REQUESTS_PER_IP_PER_DAY` | `0` | 单机按 IP 的每日提交上限；0 为关闭 |
| `TRUST_PROXY` | `false` | 是否信任反向代理提供的来源 IP |

旧版 `ANALYSIS_PROVIDER=openai-compatible` 仍可使用，但新配置应改用 `VISION_PROVIDER`。

## 处理流程

1. 解析支持的视频链接，或接收本地上传的视频。
2. 使用 FFmpeg 抽取代表性画面。
3. 使用所选 ASR Provider 转写音频。
4. 使用所选视觉 Provider 分析关键帧和字幕。
5. 删除中间音频，并在 TTL 到期后清理临时数据。

## 支持站点

原生支持抖音和 B 站（`BV` 和 `b23.tv` 链接）。

安装 yt-dlp 后，可作为 YouTube、TikTok、小红书、微博、腾讯视频等站点的兜底解析方式。实际可用性取决于 yt-dlp 版本和目标站点的反爬策略。

目前不支持抖音图文、需要登录或会员权限的内容以及快手。
