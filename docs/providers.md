# Providers

Provider selection is controlled by `.env`. The canonical list of supported provider names lives in `src/lib/provider-registry.ts`.

## Current defaults

| Capability | Env                   | Current default |
| ---------- | --------------------- | --------------- |
| AI         | `AI_PROVIDER`         | `9router`       |
| Storage    | `STORAGE_PROVIDER`    | `local`         |
| Rate limit | `RATE_LIMIT_PROVIDER` | `memory`        |
| Queue      | `QUEUE_PROVIDER`      | `none`          |
| Auth       | `AUTH_PROVIDER`       | `google`        |
| Payment    | `PAYMENT_PROVIDER`    | `none`          |

## AI

Current implemented runtime provider: `9router`.

```env
AI_PROVIDER="9router"
AI_MODELS="cmc/deepseek/deepseek-v4-pro,cmc/deepseek/deepseek-v4-flash,cmc/moonshotai/Kimi-K2.6"
NINE_ROUTER_BASE_URL="http://localhost:20129/v1"
NINE_ROUTER_API_KEY=""
```

`AI_MODELS` is comma-separated. The first model is the default.

Registered future provider names: `openai`, `anthropic`, `gemini`.

## Storage

Current implemented providers:

- `local`
- `r2`
- `s3`
- `minio`

`r2`, `s3`, and `minio` use the same S3-compatible adapter.

Local storage:

```env
STORAGE_PROVIDER="local"
UPLOAD_DIR="public/uploads"
PUBLIC_UPLOAD_BASE_URL="/uploads"
```

Cloudflare R2 example:

```env
STORAGE_PROVIDER="r2"
S3_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
S3_REGION="auto"
S3_BUCKET="umkmcepat"
S3_ACCESS_KEY_ID=""
S3_SECRET_ACCESS_KEY=""
S3_PUBLIC_BASE_URL="https://<public-domain-or-r2-dev-url>"
S3_FORCE_PATH_STYLE="false"
```

MinIO example:

```env
STORAGE_PROVIDER="minio"
S3_ENDPOINT="http://localhost:9000"
S3_REGION="us-east-1"
S3_BUCKET="umkmcepat"
S3_ACCESS_KEY_ID="minioadmin"
S3_SECRET_ACCESS_KEY="minioadmin"
S3_PUBLIC_BASE_URL="http://localhost:9000/umkmcepat"
S3_FORCE_PATH_STYLE="true"
```

## Rate limit

Current implemented providers:

- `memory`
- `none`

Registered future provider name: `redis`.

```env
RATE_LIMIT_PROVIDER="memory"
```

## Queue

No runtime queue is currently implemented.

```env
QUEUE_PROVIDER="none"
```

Registered future provider name: `bullmq`.
