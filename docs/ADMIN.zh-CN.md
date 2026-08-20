# 管理平台

Koma 把公开产品和运营能力分开：

- 普通访客免登录提交，获得不可猜、只读的 `/jobs/<id>` 永久回看链接。
- `/admin` 是受保护的运营后台，用于管理 Provider、密钥、任务和永久删除。
- 当前不做公开用户账号系统；只有出现“用户归属、私人空间、个人额度”等需求时才值得加入。

## 启用后台

在部署 Secret 或 `.env` 中配置：

```dotenv
ADMIN_PASSWORD=<随机的管理员登录密码>
KOMA_CONFIG_SECRET=<另一段稳定的随机字符串>
```

`ADMIN_PASSWORD` 为空时后台完全禁用。登录成功后使用 12 小时 HttpOnly、SameSite=Strict Cookie；连续错误登录会按 IP 限流。

`KOMA_CONFIG_SECRET` 使用 AES-256-GCM 加密 Provider API Key，应独立于登录密码并长期保持稳定。浏览器、健康检查和任务 API 都不会返回 Key 明文。

## 数据库

本地默认使用零配置 SQLite。生产环境可以接独立 MySQL 分库：

```dotenv
DB_DRIVER=mysql
DB_HOST=<私有地址>
DB_PORT=3306
DB_USER=<Secret 中的账号>
DB_PASSWORD=<Secret 中的密码>
DB_NAME=koma
DB_SSL=false
DB_AUTO_CREATE=true
```

`DB_AUTO_CREATE=true` 时，账号可自动创建 `koma` 数据库，Koma 启动时创建 `koma_settings` 和 `koma_jobs`。若使用最小权限账号，先一次性创建数据库并只授权 `koma.*`，然后设为 `false`。

数据库保存 Provider 密文与完整回看记录：状态、不含 Key 的 Provider 快照、分析要求、字幕、总结、章节、标签、结构化 JSON、产物元数据和存储对象索引。数据库不保存 Provider Key 明文和二进制媒体。

## 持久化存储

本地开发：

```dotenv
STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=./data/storage
```

生产环境使用阿里云 OSS：

```dotenv
STORAGE_DRIVER=oss
OSS_REGION=<区域>
OSS_ACCESS_KEY_ID=<Secret>
OSS_ACCESS_KEY_SECRET=<Secret>
OSS_BUCKET=<Bucket>
OSS_UPLOAD_PREFIX=koma
OSS_SIGNED_URL_SECONDS=900
```

每个任务独占 `koma/jobs/<job-id>/`，其中包含 `video/`、`frames/` 和 `artifacts/`。私有 Bucket 默认返回短时签名下载地址；只有可信的公开/CDN 域名才配置 `OSS_PUBLIC_BASE_URL`。

中间音频和工作文件在处理结束后删除；原视频、关键帧、结果和生成文件会一直保留。管理员永久删除任务时，数据库记录和该任务目录下的所有对象会一起移除。

数据库与 OSS 的真实账号密码只能放在部署 Secret 中，不能提交到公开仓库。
