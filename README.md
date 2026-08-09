# 盯帧

> 一眼盯帧，鉴定为：纯纯的好活。

一个只为小视频服务的临时分析工作台：放入本地视频或贴一个视频链接，抽出关键画面、听写人声（逐句字幕）、标出重点，再放回同一条时间线上。**阅后即焚**：视频和结果只暂存 20 分钟，不留库存。

## 功能

- 本地视频上传 + 视频链接两种入口
- 链接解析：**抖音**（短链 / 分享文案 / 精选 `modal_id` 页）、**B站**（`BV` / `b23.tv`）原生解析真实无水印直链；其他站点走 yt-dlp 兜底
- **逐句字幕**：Fun-ASR 按词级时间戳聚合成字幕行，视频上可叠加显示、一键开关
- **说话人分离**（可选）：配置公网地址后，字幕自动带「说话人 N」标签
- 画面分析：AI 总结、内容标签、关键帧、回看亮点
- 点击标签 / 关键帧 / 字幕 / 亮点可直接跳到视频对应位置
- 中间音频分析后立即删除；视频、结果与抽帧默认 20 分钟后整体清除
- 单进程内存任务表，适合小视频 MVP，也方便部署

## 快速开始

需要 **Node.js 20+**（推荐 22）。没有配置任何模型也能跑通完整流程（使用演示数据）：

```bash
npm install
npm run dev
```

打开 `http://localhost:5173`。生产模式：

```bash
npm run check   # 测试 + 类型检查 + 构建（dist/ 前端 + dist-server/ 服务端）
npm start       # 运行编译后的服务端，默认端口 3000
```

也可以直接用无头模式分析一个视频：

```bash
node dist-server/cli.js ./demo.mp4
node dist-server/cli.js https://www.bilibili.com/video/BV1xxx --json result.json --frames-dir ./frames
```

## 配置（全部可选，除了模型 Key）

复制 `.env.example` 为 `.env` 即可（`.env` 不会进仓库）。常用变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3000` | 服务端口 |
| `DASHSCOPE_API_KEY` | 空 | 阿里云百炼通用 API Key；配了才会用真实 ASR / 视觉模型 |
| `ASR_PROVIDER` | `dashscope` | 有 Key 时自动为 `dashscope`，否则 `mock` |
| `ASR_MODEL` | `fun-asr-flash-2026-06-15` | 逐句字幕用的同步 ASR |
| `ANALYSIS_PROVIDER` | `openai-compatible` | 画面分析；缺 Key 自动回退 `mock` |
| `VISION_MODEL` | `qwen3-vl-flash` | 画面理解模型 |
| `PUBLIC_BASE_URL` | 空 | 服务的公网地址；配置后自动开启**说话人分离** |
| `ASR_DIARIZATION` | `auto` | `on/off/auto`，强制开关说话人分离 |
| `MAX_UPLOAD_BYTES` | `524288000` | 上传上限（500MB） |
| `MAX_DURATION_SECONDS` | `900` | 视频最长 15 分钟 |
| `RESULT_TTL_SECONDS` | `1200` | 结果保留 20 分钟 |

没有 API Key 时，界面会完整可跑但用演示数据（健康检查里 `mock` 字段可见）。

## 工作原理

1. **取视频**：贴链接 → 解析器按平台拿到真实播放地址（抖音用分享页 `_ROUTER_DATA` 去水印；B站用官方 `view` + `playurl` 接口）→ 后台下载并实时回报进度。
2. **抽帧**：ffmpeg 按间隔抽出关键帧（默认 6 秒一张，最多 12 张）。
3. **听写**：音频切成 60 秒切片，交给 Fun-ASR-Flash 拿**词级时间戳**，按标点/停顿聚合成**逐句字幕**；配置了 `PUBLIC_BASE_URL` 时改走整段异步转写 + `diarization_enabled`，字幕带说话人。
4. **理解**：把关键帧 + 听写交给视觉模型，生成标题、总结、标签、回看亮点，并判断画面是否自带烧录字幕（决定是否自动开启叠加字幕）。
5. **即焚**：分析完立即删中间音频；视频 / 帧 / 结果在 TTL 到期或手动清除时一起消失。

## 支持哪些站点

- **原生（最稳，无需登录）**：抖音（所有常见分享形态）、B站（`BV` / `b23.tv`）
- **yt-dlp 兜底**：YouTube、TikTok、小红书、微博、腾讯视频等 1000+ 站点（服务里装了 yt-dlp 才生效；成功率受站点反爬影响）
- **暂不支持**：抖音图文笔记、需要登录/会员的付费内容、快手

## 技术栈

TypeScript · Node.js 22 · Fastify 5 · React 19 · Vite 7 · FFmpeg（ffmpeg-static）· Vitest · 阿里云百炼（Fun-ASR / Qwen-VL）

## 目录结构

```
src/
  server/   # 服务端（Fastify API、链接解析、ASR、画面分析、下载管线），tsc 编译到 dist-server/
  client/   # 前端（React），vite 构建到 dist/
docs/       # 设计与决策记录
DEPLOY.md   # 部署指南（阿里云 ECS 示例，可照搬到任意 Linux 服务器）
```

## 部署

- 常规 Linux 服务器：`npm run build` 后把 `dist/` + `dist-server/` + `package*.json` 传上去，`npm install --omit=dev`，用 pm2 / systemd / Docker 跑 `node dist-server/index.js`，nginx 反代即可（示例见 [DEPLOY.md](DEPLOY.md)，不限于阿里云）。
- Docker：仓库自带 `Dockerfile`，`docker build -t ding-frame . && docker run -p 3000:3000 ding-frame`。

## 常见问题

- **为什么我贴的链接返回「网页」错误？** 该站没有原生解析器且 yt-dlp 没装/被反爬。抖音、B站链接一般不会遇到。
- **怎么开启说话人分离？** 服务需要有公网地址并设置 `PUBLIC_BASE_URL`（例如 `https://dz.example.com`），ASR 会改用整段异步转写，字幕带「说话人 N」。
- **服务重启后结果没了？** 是的，这是「阅后即焚」的预期行为（见 `docs/decisions/0001-ephemeral-processing.md`）。
