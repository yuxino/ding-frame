# Deploy Koma

Koma can be deployed to a regular Linux server with GitHub Actions, PM2, and nginx.

Current setup: `koma.yuxino.cn → nginx → 127.0.0.1:3010 → Koma`.

## GitHub Secrets

Add these under **Settings → Secrets and variables → Actions**:

| Secret | Description |
| --- | --- |
| `SERVER_HOST` | Server IP |
| `SERVER_USER` | SSH user, usually `root` |
| `SERVER_PASSWORD` | SSH password |
| `ASR_PROVIDER` | For example `groq` or `dashscope` |
| `VISION_PROVIDER` | For example `openrouter`, `gemini`, or `dashscope` |
| `GROQ_API_KEY` | Groq key when using Groq ASR/vision |
| `OPENROUTER_API_KEY` | OpenRouter key when using OpenRouter vision |
| `DASHSCOPE_API_KEY` | DashScope key when using DashScope |
| `OPENAI_API_KEY` | OpenAI key when using OpenAI |
| `GEMINI_API_KEY` | Gemini key when using Gemini vision |
| `ASR_MODEL` | Optional provider-model override |
| `VISION_MODEL` | Optional provider-model override |
| `PUBLIC_BASE_URL` | Optional public URL for speaker diarization |
| `DEMO_REQUESTS_PER_IP_PER_DAY` | Optional public-demo daily allowance, such as `3` |

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
    server_name koma.yuxino.cn;

    client_max_body_size 600m;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # This is a single trusted proxy. Overwrite, rather than append, so
        # clients cannot spoof the address used by Koma's demo rate limiter.
        proxy_set_header X-Forwarded-For $remote_addr;
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
curl http://koma.yuxino.cn/api/health
pm2 status
pm2 logs koma
```

Tasks are stored in memory, so active jobs disappear after a service restart. Upload size, video duration, and result retention can be changed through environment variables; see [Configuration](docs/CONFIGURATION.md).
