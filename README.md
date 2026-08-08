# 盯帧

一个只为小视频服务的临时分析工作台：放入本地视频或一个可直接下载的视频地址，抽出关键画面，听写声音，再把线索放回时间线上。

## 现在能做什么

- 本地视频上传与直接视频 URL 两种入口
- 抖音播放直链兼容：自动跟随 CDN 跳转并补齐浏览器请求头
- FFmpeg 抽帧与音频整理
- ASR 适配器：默认演示数据，可切换阿里云百炼 Paraformer
- 画面分析适配器：默认本地整理，可切换阿里云百炼兼容 OpenAI Chat Completions 的视觉模型
- 结果页：关键画面、时间线、听写片段和几个值得回看的瞬间
- 原视频和中间音频在分析完成后立即清除；结果和抽帧默认 20 分钟后清除
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

接入阿里云百炼时，至少设置：

```env
ASR_PROVIDER=dashscope
ANALYSIS_PROVIDER=openai-compatible
DASHSCOPE_API_KEY=你的百炼通用APIKey
VISION_MODEL=qwen3-vl-flash
```

ASR 还需要配置北京 OSS 临时桶和 RAM 访问凭证；服务会把中间 WAV 上传到 OSS，拿到签名 URL 后调用 Paraformer，并在任务结束后删除该对象。`VISION_API_KEY` 留空时会自动复用 `DASHSCOPE_API_KEY`。

画面分析默认使用 `qwen3-vl-flash`。没有这些配置时，mock 适配器仍会让抽帧、任务状态和结果页面可验证；此时页面里的听写和总结只是演示数据，不代表真实视频内容。

## CI 与阿里云

- `.github/workflows/ci.yml`：安装依赖、跑测试、构建前端。
- `.github/workflows/deploy-aliyun.yml`：预留 ACR + ECS 的镜像发布与滚动替换流程，使用仓库 secrets，不把密钥写进项目。
- `Dockerfile`：单容器部署，服务端同时承载 API 和构建后的前端。

部署前至少准备这些 GitHub Actions secrets：`ACR_REGISTRY`、`ACR_NAMESPACE`、`ACR_USERNAME`、`ACR_PASSWORD`、`ALIYUN_ECS_HOST`、`ALIYUN_ECS_USER`、`ALIYUN_ECS_SSH_KEY`。ECS 上准备 `/etc/between-frames/.env`，再开启 workflow。

## 约束

第一版默认限制为 500MB、15 分钟、每 6 秒一帧最多 12 帧。它刻意不做长视频队列、历史库和永久文件存储，以保持“放进来、看一遍、消失”的感觉。
