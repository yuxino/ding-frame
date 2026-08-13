# Deploy Koma

Koma can be deployed to a regular Linux server with GitHub Actions, PM2, and nginx.

Current setup: `dz.yuxino.cn → nginx → 127.0.0.1:3010 → Koma`.

## GitHub Secrets

Add these under **Settings → Secrets and variables → Actions**:

| Secret | Description |
| --- | --- |
| `SERVER_HOST` | Server IP |
| `SERVER_USER` | SSH user, usually `root` |
| `SERVER_PASSWORD` | SSH password |
| `DASHSCOPE_API_KEY` | Alibaba Cloud Model Studio API key |
| `ASR_PROVIDER` | `dashscope` |
| `ASR_MODEL` | `fun-asr-flash-2026-06-15` |
| `ANALYSIS_PROVIDER` | `openai-compatible` |
| `VISION_MODEL` | `qwen3-vl-flash` |
| `PUBLIC_BASE_URL` | Optional public URL for speaker diarization |

## Server Setup

Install Node.js 20+ (22 recommended), PM2, and nginx.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs nginx
npm i -g pm2
```

Example nginx configuration:

```nginx
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
```

Save it as `/etc/nginx/sites-available/koma`, enable it, then reload nginx:

```bash
ln -s /etc/nginx/sites-available/koma /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

## Deployment

The GitHub Actions workflow builds the application, copies the required files to `~/koma`, installs production dependencies, writes `.env`, and reloads the PM2 process.

Equivalent PM2 command:

```bash
pm2 reload koma || pm2 start dist-server/index.js --name koma
pm2 save
```

## Verify

```bash
curl http://dz.yuxino.cn/api/health
pm2 status
pm2 logs koma
```

Tasks are stored in memory, so active jobs disappear after a service restart. Upload size, video duration, and result retention can be changed through environment variables; see [Configuration](docs/CONFIGURATION.md).
