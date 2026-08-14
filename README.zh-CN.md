<div align="center">
  <img src="public/koma-readme-icon.png" width="112" alt="Koma icon">
  <h1>Koma</h1>
  <p>AI 视频理解工具。</p>
  <p>
    <a href="README.md">English</a>
  </p>
</div>

上传视频或粘贴视频链接，Koma 会提取关键画面、转写语音，并通过 AI 总结视频内容、标出重点片段，统一展示在时间线上。

## 功能

- **视频输入** — 支持本地视频和视频链接分析。
- **字幕** — 生成带时间戳的逐句字幕，可选说话人分离。
- **重点内容** — 生成总结、标签、关键帧和重点片段。
- **时间线跳转** — 从分析结果直接跳到对应视频位置。
- **临时处理** — 视频和分析数据会自动清理。

## 快速开始

需要 Node.js 20+。

```bash
npm install
npm run dev
```

打开 `http://localhost:5173`。

更多信息见 [配置](docs/CONFIGURATION.zh-CN.md)、[部署](DEPLOY.md) 和 [设计决策](docs/decisions/)。
