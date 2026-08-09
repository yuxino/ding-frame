# 部署到阿里云 ECS

盯帧用 GitHub Actions 自动部署：push 到 `main` 后，CI 跑测试 → 构建 Docker 镜像 → 推到阿里云容器镜像仓库（ACR）→ SSH 到 ECS 拉取镜像并启动容器。

## 一、前置条件

- GitHub 仓库：`yuxino/ding-frame`（已有）
- 阿里云账号，开通 **容器镜像服务 ACR** 和一台 **ECS**（Linux）
- ECS 上装好 Docker，安全组放行 **22**（SSH）和 **3000**（服务）

## 二、配置 GitHub Secrets

在仓库 Settings → Secrets and variables → Actions 里添加（推荐新建 production environment 后加到环境里，或直接加到仓库级）：

| Secret | 说明 | 示例 |
|---|---|---|
| `ACR_REGISTRY` | 容器镜像仓库地址 | `registry.cn-hangzhou.aliyuncs.com` |
| `ACR_NAMESPACE` | ACR 命名空间 | `yuxino` |
| `ACR_USERNAME` | 阿里云账号 / RAM 用户（有 ACR 权限） | |
| `ACR_PASSWORD` | 对应密码 / AccessKey Secret | |
| `ALIYUN_ECS_HOST` | ECS 公网 IP | `8.8.8.8` |
| `ALIYUN_ECS_USER` | SSH 用户名 | `root` 或 `ubuntu` |
| `ALIYUN_ECS_SSH_KEY` | SSH 私钥全文 | `-----BEGIN OPENSSH PRIVATE KEY-----...` |

> 生产建议：用 RAM 子账号 + 最小权限（`AliyunContainerRegistryFullAccess`），不要用主账号密钥。

## 三、阿里云 ACR 准备

1. 控制台 → 容器镜像服务 ACR → 创建**命名空间**（如 `yuxino`）。
2. 在该命名空间下创建镜像仓库 `ding-frame`（类型：本地仓库即可，仓库地址会自动形如 `registry.cn-hangzhou.aliyuncs.com/yuxino/ding-frame`）。

## 四、ECS 准备

```bash
# 1. 装 Docker（Ubuntu/Debian）
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 2. 创建环境变量文件（把真实 Key 填进去）
mkdir -p /etc/ding-frame
cat > /etc/ding-frame/.env <<'ENV'
PORT=3000
ASR_PROVIDER=dashscope
DASHSCOPE_API_KEY=你的百炼通用APIKey
ASR_MODEL=fun-asr-flash-2026-06-15
ANALYSIS_PROVIDER=openai-compatible
VISION_MODEL=qwen3-vl-flash
# 可选：开启说话人分离（需要 ECS 有公网地址，且 3000 端口已放行）
# PUBLIC_BASE_URL=http://你的ECS公网IP:3000
# ASR_DIARIZATION=auto
ENV
chmod 600 /etc/ding-frame/.env
```

> `.env` 只存在 ECS 上，不会进仓库。改完配置后重跑一次部署即可生效。

## 五、部署与验证

- 配置好 secrets 后，push 到 `main` 会自动触发 `Deploy to Aliyun ECS`；也可以在 Actions 页面手动 `Run workflow`。
- 验证：

```bash
curl http://你的ECS公网IP:3000/api/health
# 期望：{"ok":true,"service":"ding-frame","asrProvider":"dashscope",...}
```

## 已知注意点

- 容器内已内置 `python3 + yt-dlp`，B站/抖音原生解析不依赖它；其他站点走 yt-dlp 兜底。
- 服务重启后内存中的任务会消失（阅后即焚语义，见 `docs/decisions/0001-ephemeral-processing.md`）。
- ECS 公网 IP 变更是阿里云普通带宽 ECS 的常见情况；`PUBLIC_BASE_URL` 需要跟着改。
