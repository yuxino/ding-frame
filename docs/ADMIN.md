# Administration

Koma separates the public product from operations:

- Public visitors submit without an account and receive an unguessable, read-only `/jobs/<id>` replay link.
- `/admin` is the protected operations console for providers, credentials, jobs, and permanent deletion.
- Koma does not include a public user-account system. Add one only when the product needs per-user ownership, private workspaces, or quotas.

## Enable the console

Set two deployment secrets:

```dotenv
ADMIN_PASSWORD=<random administrator password>
KOMA_CONFIG_SECRET=<a separate stable random secret>
```

When `ADMIN_PASSWORD` is empty, administration is disabled. Sign-in creates a 12-hour HttpOnly, SameSite=Strict cookie, and repeated failed logins are rate limited by IP.

`KOMA_CONFIG_SECRET` encrypts provider API keys with AES-256-GCM. Keep it stable and separate from the login password. Plaintext keys are never returned by the browser, health endpoint, or job APIs.

## Database

SQLite is the zero-config local default. Production can use a dedicated MySQL schema:

```dotenv
DB_DRIVER=mysql
DB_HOST=<private endpoint>
DB_PORT=3306
DB_USER=<secret account>
DB_PASSWORD=<secret password>
DB_NAME=koma
DB_SSL=false
DB_AUTO_CREATE=true
```

With `DB_AUTO_CREATE=true`, the configured account may create the `koma` database and Koma creates `koma_settings` and `koma_jobs` on startup. For a least-privilege deployment, create the database once, grant only `koma.*`, and set `DB_AUTO_CREATE=false`.

The database contains encrypted provider settings plus the complete replay record: status, provider snapshot without keys, request, transcript, summary, chapters, tags, extracted JSON, artifact metadata, and storage object keys. It never stores plaintext provider keys or binary media.

## Persistent storage

Local development:

```dotenv
STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=./data/storage
```

Aliyun OSS production:

```dotenv
STORAGE_DRIVER=oss
OSS_REGION=<region>
OSS_ACCESS_KEY_ID=<secret>
OSS_ACCESS_KEY_SECRET=<secret>
OSS_BUCKET=<bucket>
OSS_UPLOAD_PREFIX=koma
OSS_SIGNED_URL_SECONDS=900
```

Each task owns `koma/jobs/<job-id>/`, containing `video/`, `frames/`, and `artifacts/`. Private buckets use short-lived signed download URLs. `OSS_PUBLIC_BASE_URL` is optional for a trusted public/CDN base URL.

Intermediate audio and working files are removed after processing. Source video, frames, results, and generated files remain until an administrator deletes the job. Admin deletion removes both the database row and every object under the job prefix.

Never commit real database or OSS credentials. Keep them in deployment secrets only.
