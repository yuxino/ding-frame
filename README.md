# 盯帧

> 一眼盯帧，鉴定为：纯纯的好活。

一个只为小视频服务的临时分析工作台：放入本地视频或一个可直接下载的视频地址，抽出关键画面，听写声音，再把线索放回时间线上。

## 现在能做什么

- 本地视频上传与视频链接两种入口
- 链接解析：直接贴抖音分享链接（`v.douyin.com` 短链、分享文案、`iesdouyin.com` 分享页、带 `modal_id` 的精选/搜索页）即可自动解析出真实无水印播放地址；其他热门网站（B站、YouTube、小红书等）在安装了 yt-dlp 时自动兜底
- 抖音播放直链兼容：自动跟随 CDN 跳转并补齐浏览器请求头
- FFmpeg 抽帧与音频整理
- 逐句字幕：Fun-ASR-Flash 按词级时间戳聚合，每句字幕带起止时间，点击直接回看
- 说话人分离：配置公网地址后自动开启，字幕带「说话人 N」标签（多人对话/访谈场景）
- 画面分析适配器：默认本地整理，可切换阿里云百炼兼容 OpenAI Chat Completions 的视觉模型
- 结果页：临时视频播放器（可叠加逐句字幕，一键开关）、AI 总结、内容标签、关键帧、ASR 和回看亮点
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

## 字幕与说话人分离

- **逐句字幕（默认）**：ASR 用同步 Fun-ASR-Flash（base64 直传，无需公网地址），返回词级时间戳后按标点/停顿聚合为字幕行；结果页每句一行，点击直接跳到对应位置。
- **说话人分离（可选）**：百炼的同步 Fun-ASR-Flash 不支持说话人分离，带说话人标签的转写要走异步 Fun-ASR（整段音频 + `diarization_enabled`），要求服务有**公网可访问的地址**：
  ```env
  # 服务公网地址（例如 ECS 的公网 IP/域名），配置后自动开启说话人分离
  PUBLIC_BASE_URL=http://你的公网地址:3010
  # 也可以用 ASR_DIARIZATION=on/off 强制指定，auto 表示跟随 PUBLIC_BASE_URL
  ASR_DIARIZATION=auto
  ```
  开启后，分析时会先把整段音频临时挂到 `/api/temp/<token>` 供百炼回源，任务结束立即删除，不会长期暴露。
- 本地开发没有公网地址时自动走「逐句字幕」模式，不受影响。

## 链接解析原理

- 从分享文案里自动提取第一条 http(s) 链接。
- 抖音短链先跟随重定向到分享页，再解析页面里的 `window._ROUTER_DATA`（无需登录、无需签名），把 `playwm`（带水印）换成 `play`（无水印）拿到真实播放地址；页面没有数据时回退到 `og:video`。精选/搜索弹窗页（`jingxuan/search?modal_id=…`）本身是前端渲染不带数据，会先用 `modal_id` 拼出分享页再解析。
- 非抖音链接：如果系统里装了 `yt-dlp`，会用 `yt-dlp --no-playlist -g` 解析直链；没有装则按原链接直接尝试下载。
- 解析不出来也不会误报：直接走原链接下载，失败时给出可读的提示。

## 支持哪些站点

按可靠程度分三档：

**第一档 · 原生支持，最稳（无需任何外部工具）**

- 抖音（所有常见形态）：`v.douyin.com` 短链、整段分享文案、`www.douyin.com/video/<id>`、`www.iesdouyin.com/share/video/<id>`、带 `modal_id` 的精选/搜索弹窗页（`jingxuan/search?...`）
- B站（`www.bilibili.com/video/BVxxx`、`b23.tv` 短链）：官方接口直接解析直链，无需登录
- 视频直链：任何直接指向 mp4 / mov / webm 等媒体文件的地址

**第二档 · yt-dlp 自动兜底（服务里装了 yt-dlp 就生效，覆盖 1800+ 站点）**

常见热门站：YouTube（含 Shorts、youtu.be）、TikTok、小红书（含 xhslink.com）、微博、Instagram、Twitter/X、Facebook、腾讯视频（v.qq.com）、爱奇艺、优酷、斗鱼、虎牙、搜狐视频、Vimeo 等

**第三档 · 暂不支持**

- 抖音图文笔记（`/note/`，是图片合集不是视频）
- 需要登录 / 会员 / 私密的付费内容
- 快手：当前 yt-dlp 还没有快手解析器，暂时不支持

**已知限制**

- 抖音与 B站链路无需登录、最稳定；其他站点走 yt-dlp，成功率受网络环境与站点反爬影响（例如部分网络下 YouTube 会触发人机验证），必要时可后续加 cookies 支持
- 视频时长沿用盯帧第一版限制（默认最长 15 分钟）

## 无头分析（命令行）

不打开网页也能批量分析：同一个管线会复用本机配置，结果以 JSON 输出，进度打印在标准错误里。

```bash
node src/server/cli.js ./demo.mp4
node src/server/cli.js https://example.com/video.mp4 --json result.json --frames-dir ./frames
```

- `--json <路径>`：把分析结果写入文件（默认打印到标准输出）。
- `--frames-dir <路径>`：保留关键帧图片到该目录（默认分析完即删，延续“阅后即焚”语义）。
- 没有配置模型时同样走演示数据，标准错误里会给出提示。

## 接入真实模型

复制 `.env.example` 为 `.env`。服务会自动加载 `.env`，但不要把真实 key 提交到 GitHub。

接入阿里云百炼时，只需要一个通用 API Key：

```env
ASR_PROVIDER=dashscope
ANALYSIS_PROVIDER=openai-compatible
DASHSCOPE_API_KEY=你的百炼通用APIKey
ASR_MODEL=fun-asr-flash-2026-06-15
VISION_MODEL=qwen3-vl-flash
```

不需要 OSS Bucket。服务会把音频压成 64kbps MP3、按分钟切片，并以 Base64 直接交给千问 ASR；抽帧同样以 Base64 直接交给视觉模型。音频切片在分析完成后立即删除，原视频仅为结果页回看临时保留，到期或手动清除时连同抽帧一起删除。`VISION_API_KEY` 留空时自动复用 `DASHSCOPE_API_KEY`。

画面分析默认使用 `qwen3-vl-flash`。没有 `.env` 时，mock 适配器仍会让抽帧、任务状态和结果页面可验证；此时页面里的听写和总结只是演示数据，不代表真实视频内容。即使按 `.env.example` 声明了 `ASR_PROVIDER=dashscope` / `ANALYSIS_PROVIDER=openai-compatible` 却忘了填 key，服务也会自动回退到演示数据并给出警告，不会让任务直接失败。

百炼免费额度有地域、期限和用量限制，不是永久无限。建议使用华北 2（北京）的通用 API Key，并在百炼控制台开启“免费额度用完即停”，避免额度耗尽后产生费用。参考[新人免费额度](https://help.aliyun.com/zh/model-studio/new-free-quota/)与[千问 ASR API](https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference)。

## CI 与阿里云

- `.github/workflows/ci.yml`：安装依赖、跑测试、构建前端。
- `.github/workflows/deploy-aliyun.yml`：ACR + ECS 的镜像发布流程，使用仓库 secrets，不把密钥写进项目。
- `Dockerfile`：单容器部署，服务端同时承载 API 和构建后的前端。

部署前至少准备这些 GitHub Actions secrets：`ACR_REGISTRY`、`ACR_NAMESPACE`、`ACR_USERNAME`、`ACR_PASSWORD`、`ALIYUN_ECS_HOST`、`ALIYUN_ECS_USER`、`ALIYUN_ECS_SSH_KEY`。ECS 上准备 `/etc/ding-frame/.env`，再开启 workflow。

## 约束

第一版默认限制为 500MB、15 分钟、每 6 秒一帧最多 12 帧。它刻意不做长视频队列、历史库和永久文件存储，以保持“放进来、看一遍、消失”的感觉。
