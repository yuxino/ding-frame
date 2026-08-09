# 部署盯帧（pm2 + nginx + dz.yuxino.cn）

和 yuxino-labs 其他 API 项目同一套姿势：GitHub Actions 把代码推到阿里云服务器，pm2 托管，nginx 反代域名。

架构：`dz.yuxino.cn → nginx(80/443) → 127.0.0.1:3010（pm2 里的 ding-frame）`

> 端口说明：服务器上 3000 已被另一个服务（`myapp`）占用，盯帧固定跑 **3010**（本地开发也一直是 3010）。

## 一、GitHub Secrets

在仓库 Settings → Secrets and variables → Actions 添加：

| Secret | 说明 |
|---|---|
| `SERVER_HOST` | 服务器 IP |
| `SERVER_USER` | SSH 用户名（通常 `root`） |
| `SERVER_PASSWORD` | SSH 密码（或用密钥登录时留空，见下方「密钥登录」） |
| `DASHSCOPE_API_KEY` | 阿里云百炼通用 Key（必填） |
| `ASR_PROVIDER` | `dashscope` |
| `ASR_MODEL` | `fun-asr-flash-2026-06-15` |
| `ANALYSIS_PROVIDER` | `openai-compatible` |
| `VISION_MODEL` | `qwen3-vl-flash` |
| `PUBLIC_BASE_URL` | 可选；如 `http://dz.yuxino.cn`，配置后开启说话人分离 |

> 当前工作流走密码登录。想用 SSH 密钥的话，把 `SERVER_PASSWORD` 换成 `SERVER_SSH_KEY` 并在 `deploy.yml` 里改用 `key` 参数。

## 二、服务器一次性准备

```bash
# 1. 装 Node 20+（推荐 22）和 pm2
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm i -g pm2

# 2. 装 nginx
apt-get install -y nginx

# 3. nginx 配置 dz.yuxino.cn 反代到 3010
cat > /etc/nginx/sites-available/ding-frame <<'NGINX'
server {
    listen 80;
    server_name dz.yuxino.cn;

    client_max_body_size 600m;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
ln -s /etc/nginx/sites-available/ding-frame /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 4. DNS：把 dz.yuxino.cn 解析到服务器 IP（阿里云控制台 → 云解析 DNS）
```

> 传 HTTPS：用 certbot 签发证书后把上面的 `listen 80` 改为 443 + `return 301`，反代配置不变。

## 三、部署流程（自动）

push 到 `main` 后 `Deploy and Restart ding-frame` 会自动：
1. `npm ci` → `npm test` → `npm run build:client`
2. SCP `dist/ src/ package.json package-lock.json` 到 `~/ding-frame`
3. SSH：`npm ci --production` → 写 `.env`（从 secrets 生成，含 API Key）→ `pm2 reload ding-frame || pm2 start src/server/index.js --name ding-frame` → `pm2 save`

手动触发：Actions 页面 → Deploy and Restart ding-frame → Run workflow。

## 四、验证

```bash
curl http://dz.yuxino.cn/api/health
# {"ok":true,"service":"ding-frame","asrProvider":"dashscope",...}

# 服务器上
pm2 status            # ding-frame online
pm2 logs ding-frame   # 看日志
```

## 已知注意点

- 服务重启后内存中的任务会消失（阅后即焚语义，见 `docs/decisions/0001-ephemeral-processing.md`）。
- 上传上限默认 500MB、视频最长 15 分钟；nginx 的 `client_max_body_size` 已放大。
- 服务器需要能访问 `api.bilibili.com`、`api.douyin.com` 等；阿里云服务器出网一般没问题。
- 改环境变量：直接在 GitHub Secrets 里改，然后手动跑一次 workflow 即可；`.env` 会在每次部署时重新生成。
