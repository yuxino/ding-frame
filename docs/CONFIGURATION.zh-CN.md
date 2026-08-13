# 配置

复制 `.env.example` 为 `.env`。大部分配置都是可选的。没有配置模型凭证时，盯帧也可以使用 mock 数据运行。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务端口 |
| `DASHSCOPE_API_KEY` | 空 | 阿里云百炼 API Key，用于 ASR 和视觉模型 |
| `ASR_PROVIDER` | `dashscope` | ASR 提供方；没有凭证时回退到 `mock` |
| `ASR_MODEL` | `fun-asr-flash-2026-06-15` | 字幕使用的 ASR 模型 |
| `ANALYSIS_PROVIDER` | `openai-compatible` | 画面分析提供方；没有凭证时回退到 `mock` |
| `VISION_MODEL` | `qwen3-vl-flash` | 视觉语言模型 |
| `PUBLIC_BASE_URL` | 空 | 服务公网地址；配置后可启用说话人分离 |
| `ASR_DIARIZATION` | `auto` | 说话人分离模式：`on`、`off` 或 `auto` |
| `MAX_UPLOAD_BYTES` | `524288000` | 最大上传大小（500 MB） |
| `MAX_DURATION_SECONDS` | `900` | 视频最长时长（15 分钟） |
| `RESULT_TTL_SECONDS` | `1200` | 分析结果保留时间（20 分钟） |

## 处理流程

1. 解析支持的视频链接，或接收本地上传的视频。
2. 使用 FFmpeg 抽取代表性画面。
3. 使用 Fun-ASR 转写音频，并根据词级时间戳生成逐句字幕。
4. 使用配置的视觉模型分析画面和转写内容。
5. 删除中间音频，并在 TTL 到期后清理临时数据。

## 支持站点

原生支持抖音和 B 站（`BV` 和 `b23.tv` 链接）。

安装 yt-dlp 后，可作为 YouTube、TikTok、小红书、微博、腾讯视频等站点的兜底解析方式。实际可用性取决于 yt-dlp 版本和目标站点的反爬策略。

目前不支持抖音图文、需要登录或会员权限的内容以及快手。
