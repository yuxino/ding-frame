# 盯帧

> 一眼盯帧，鉴定为真。

一个只为小视频服务的临时分析工作台：放入本地视频或一个可直接下载的视频地址，抽出关键画面，听写声音，再把线索放回时间线上。

## 现在能做什么

- 本地视频上传与直接视频 URL 两种入口
- 抖音播放直链兼容：自动跟随 CDN 跳转并补齐浏览器请求头
- FFmpeg 抽帧与音频整理
- ASR 适配器：默认演示数据，可切换阿里云百炼 `qwen3-asr-flash`
- 画面分析适配器：默认本地整理，可切换阿里云百炼兼容 OpenAI Chat Completions 的视觉模型
- 结果页：临时视频播放器、AI 总结、内容标签、关键帧、ASR 和回看亮点
- 点击标签、关键帧、ASR 或回看亮点可直接跳到视频对应位置
- 中间音频分析后立即清除；原视频、结果和抽帧默认 20 分钟后一起清除
- 单进程内存任务表，适合小视频 MVP；后续若多人并发再换队列/数据库

## 本地运行

需要 Node.js 22+。模型没有配置时也可以完整跑通界面和演示分析：

```bash
npm install
npm run dev
```

打开 `http://localhost:5173`。生产模式：

```bash
npm run check
npm start
```

## 接入真实模型

复制 `.env.example` 为 `.env`。服务会自动加载 `.env`，但不要把真实 key 提交到 GitHub。

接入阿里云百炼时，只需要一个通用 API Key：

```env
ASR_PROVIDER=dashscope
ANALYSIS_PROVIDER=openai-compatible
DASHSCOPE_API_KEY=你的百炼通用APIKey
ASR_MODEL=qwen3-asr-flash
VISION_MODEL=qwen3-vl-flash
```

不需要 OSS Bucket。服务会把音频压成 64kbps MP3、按分钟切片，并以 Base64 直接交给千问 ASR；抽帧同样以 Base64 直接交给视觉模型。音频切片在分析完成后立即删除，原视频仅为结果页回看临时保留，到期或手动清除时连同抽帧一起删除。`VISION_API_KEY` 留空时自动复用 `DASHSCOPE_API_KEY`。

画面分析默认使用 `qwen3-vl-flash`。没有 `.env` 时，mock 适配器仍会让抽帧、任务状态和结果页面可验证；此时页面里的听写和总结只是演示数据，不代表真实视频内容。

百炼免费额度有地域、期限和用量限制，不是永久无限。建议使用华北 2（北京）的通用 API Key，并在百炼控制台开启“免费额度用完即停”，避免额度耗尽后产生费用。参考[新人免费额度](https://help.aliyun.com/zh/model-studio/new-free-quota/)与[千问 ASR API](https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference)。

## CI 与阿里云

- `.github/workflows/ci.yml`：安装依赖、跑测试、构建前端。
- `.github/workflows/deploy-aliyun.yml`：ACR + ECS 的镜像发布流程，使用仓库 secrets，不把密钥写进项目。
- `Dockerfile`：单容器部署，服务端同时承载 API 和构建后的前端。

部署前至少准备这些 GitHub Actions secrets：`ACR_REGISTRY`、`ACR_NAMESPACE`、`ACR_USERNAME`、`ACR_PASSWORD`、`ALIYUN_ECS_HOST`、`ALIYUN_ECS_USER`、`ALIYUN_ECS_SSH_KEY`。ECS 上准备 `/etc/ding-frame/.env`，再开启 workflow。

## 约束

第一版默认限制为 500MB、15 分钟、每 6 秒一帧最多 12 帧。它刻意不做长视频队列、历史库和永久文件存储，以保持“放进来、看一遍、消失”的感觉。
