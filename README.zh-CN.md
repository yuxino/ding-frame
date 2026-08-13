# 盯帧

[English](README.md) | [简体中文](README.zh-CN.md)

一个轻量的短视频分析工作台。

上传视频或粘贴视频链接，盯帧会提取关键画面、转写语音，并通过 AI 总结视频内容、识别重点片段，统一展示在时间线上。

## 功能

- 本地视频上传和视频链接分析
- 原生解析抖音、B站，其他站点可通过 yt-dlp 兜底
- 带时间戳的逐句字幕和可选的说话人分离
- AI 总结、标签、关键帧和重点片段
- 从分析结果直接跳转到对应视频时间点
- 自动清理临时视频和分析数据

## 快速开始

需要 Node.js 20+。

```bash
npm install
npm run dev
```

打开 `http://localhost:5173`。

## 技术栈

TypeScript · Fastify · React · Vite · FFmpeg · Fun-ASR · Qwen-VL

## 文档

- [配置与支持站点](docs/CONFIGURATION.zh-CN.md)
- [部署](DEPLOY.md)
- [设计决策](docs/decisions/)
