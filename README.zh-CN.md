# 盯帧

[English](README.md) | [简体中文](README.zh-CN.md)

盯帧是一个用于短视频分析的临时工作台。它支持上传本地视频或输入视频链接，提取代表性画面、生成带时间戳的逐句字幕、识别重点内容，并将结果整理到同一条时间线上。

视频和分析结果默认只临时保存。中间音频会在处理完成后立即删除，视频、抽帧和分析结果会在配置的 TTL 到期后清理，默认保留 20 分钟。

## 功能

- 支持本地视频上传和视频链接分析
- 原生解析抖音、B站链接，其他支持站点可通过 yt-dlp 兜底
- 根据 ASR 词级时间戳生成逐句字幕
- 配置公网服务地址后可启用说话人分离
- AI 生成视频总结、内容标签、关键帧和重点片段
- 点击字幕、标签、关键帧或重点内容可跳转到对应时间点
- 自动清理中间音频和临时分析数据
- 使用简单的内存任务存储，适合轻量部署

## 快速开始

需要 Node.js 20+，推荐 Node.js 22。

```bash
npm install
npm run dev
```

打开 `http://localhost:5173`。

生产环境构建：

```bash
npm run check
npm start
```

也可以通过命令行直接分析视频：

```bash
node dist-server/cli.js ./demo.mp4
node dist-server/cli.js https://www.bilibili.com/video/BV1xxx --json result.json --frames-dir ./frames
```

## 配置

复制 `.env.example` 为 `.env`。大部分配置都是可选的；没有配置模型凭证时，应用仍可以使用 mock 数据运行完整流程。

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

## 工作原理

1. **获取视频**：解析支持的视频链接，或接收本地上传的视频。
2. **抽取画面**：使用 FFmpeg 从视频中采样代表性画面。
3. **语音转写**：Fun-ASR 生成词级时间戳，再聚合为逐句字幕。
4. **内容分析**：视觉模型结合关键帧和转写内容，生成标题、总结、标签和重点片段。
5. **清理数据**：中间音频立即删除；视频、抽帧和结果在 TTL 到期或手动清除时删除。

## 支持站点

- **原生支持：** 抖音、B站（`BV` 和 `b23.tv` 链接）
- **yt-dlp 兜底：** YouTube、TikTok、小红书、微博、腾讯视频，以及 yt-dlp 支持的其他站点
- **暂不支持：** 抖音图文、需要登录或会员权限的内容、快手

yt-dlp 兜底能力会受到版本和目标站点反爬策略影响。

## 技术栈

TypeScript · Node.js 22 · Fastify 5 · React 19 · Vite 7 · FFmpeg · Vitest · 阿里云百炼（Fun-ASR / Qwen-VL）

## 项目结构

```text
src/
  server/   # Fastify API、链接解析、ASR、画面分析、下载流程
  client/   # React 前端
docs/       # 设计和决策记录
DEPLOY.md   # 部署指南
```

## 部署

普通 Linux 服务器可以在构建后部署 `dist/`、`dist-server/` 和 package 文件，安装生产依赖后，通过 systemd、PM2 等进程管理工具运行 `node dist-server/index.js`。具体示例见 [DEPLOY.md](DEPLOY.md)。

也支持 Docker：

```bash
docker build -t ding-frame .
docker run -p 3000:3000 ding-frame
```

## License

许可信息请查看仓库中的 License 文件。
