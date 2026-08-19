<div align="center">
  <img src="public/koma-readme-icon.png" width="112" alt="Koma icon">
  <h1>Koma</h1>
  <p>AI 视频理解工具。</p>
  <p>
    <a href="README.md">English</a>
  </p>
</div>

上传视频或粘贴视频链接，Koma 会提取关键画面、转写语音，并用 AI 把视频内容**分章节讲清楚**，统一放在一条可以点击跳转的时间线上。

## 功能

- **视频输入** — 支持本地视频和公开视频链接（抖音、B 站、YouTube 等，其他站点通过 yt-dlp 兜底）。
- **章节总结** — AI 把视频按内容切成带时间的章节，每章有标题和两三句说明；点击任意章节直接跳到对应内容。
- **关键帧** — 用场景检测抓画面突变/转场瞬间，再按时间均匀补足覆盖全程；点击缩略图可预览大图。
- **字幕** — 生成带时间戳的逐句字幕，可选说话人分离（失败时自动降级为普通听写）。
- **内容标签** — AI 生成带时间的标签，点击跳到首次出现的位置。
- **时间线跳转** — 从章节、标签、字幕、关键帧直接跳到视频对应位置。
- **语言跟随** — 标题、总结、章节、标签、画面描述随界面语言输出（中文或英文）。
- **智能下载** — 分享链接先解析成真实地址再下载；超长视频在下载前就被拒绝，不用白等整段拉完。
- **临时处理** — 视频和分析数据在 TTL 到期后自动清理。

## 快速开始

需要 Node.js 20+，FFmpeg 已通过 `ffmpeg-static` 内置。

```bash
npm install
npm run dev
```

打开 `http://localhost:5173`。

不配置任何 API Key 也能用演示数据跑通完整流程；配置阿里云百炼 API Key 后启用真实语音转写与画面分析（见 [配置](docs/CONFIGURATION.zh-CN.md)）。

## CLI

在终端里分析视频或链接：

```bash
node dist-server/cli.js <视频路径或链接> [--lang en|zh] [--json 输出.json] [--frames-dir 目录]
```

## 文档

- [配置](docs/CONFIGURATION.zh-CN.md) — 环境变量说明
- [部署](DEPLOY.md) — PM2 + nginx 部署
- [设计决策](docs/decisions/)
