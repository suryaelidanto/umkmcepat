# Deployment

Runtime, Docker, storage, and monitoring notes for UMKM Cepat.

## Local development

Run Next.js locally and infrastructure in Docker:

```bash
bun install
cp .env.example .env
bun run infra
bun run db:migrate
bun run dev
```

```text
App: http://localhost:3000
```

Optional AI gateway:

```bash
bun run infra:ai
```

```text
9Router: http://localhost:20129
```

Use local Node/Bun for the Next.js dev server because bind-mounted Docker dev can make `.next` and file watching stale on some host filesystems.

If `.next` gets stale, stop the dev server, remove `.next`, then restart `bun run dev`.

## Production Compose

Build and start production services:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Production Compose runs:

```text
app container:      Next.js production server
postgres container: database, unless using managed Postgres
9router container:  AI gateway dashboard/API
headroom container: optional context compression proxy
uploads volume:     local upload persistence for OBJECT_STORAGE_PROVIDER=local
```

Public-facing services bind to localhost:

```text
app:     127.0.0.1:3000
9Router: 127.0.0.1:20129
```

Put Cloudflare Tunnel, Cloudflare Access, Nginx, Caddy, or another reverse proxy in front. Do not expose Postgres or Headroom publicly.

Preferred ingress:

```text
umkmcepat.com          -> reverse proxy/tunnel -> http://localhost:3000
www.umkmcepat.com      -> reverse proxy/tunnel -> http://localhost:3000
9router.umkmcepat.com  -> protected access     -> http://localhost:20129
```

The app image runs migrations before the production server starts:

```bash
bunx prisma migrate deploy && bun run start
```

## Minimum production env

```env
NEXT_PUBLIC_APP_URL="https://umkmcepat.com"
NEXTAUTH_URL="https://umkmcepat.com"
NEXTAUTH_SECRET="replace-with-strong-secret"
GOOGLE_CLIENT_ID="replace"
GOOGLE_CLIENT_SECRET="replace"
AI_PROVIDER="9router"
NINE_ROUTER_BASE_URL="http://9router:20128/v1"
NINE_ROUTER_API_KEY="replace-with-9router-api-key"
RATE_LIMIT_PROVIDER="memory"
OBJECT_STORAGE_PROVIDER="local"
LOCAL_UPLOAD_DIR=".data/uploads"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="replace-with-strong-db-password"
POSTGRES_DB="umkmcepat"
```

If `OBJECT_STORAGE_PROVIDER="local"`, mount `LOCAL_UPLOAD_DIR` as a persistent volume. If a future deployment uses `OBJECT_STORAGE_PROVIDER="r2"`, the R2 adapter/env owns persistence and the local uploads volume is optional.

If Headroom compression is enabled in 9Router, use this Docker-internal proxy URL:

```text
http://headroom:8787
```

## Monitoring

Sentry is optional locally. Leave Sentry env vars empty unless testing monitoring.

```env
SENTRY_DSN=""
NEXT_PUBLIC_SENTRY_DSN=""
```

Production uses deployment secrets:

```env
SENTRY_DSN="https://example.ingest.sentry.io/project-id"
NEXT_PUBLIC_SENTRY_DSN="https://example.ingest.sentry.io/project-id"
```

If source maps are uploaded during production builds, set the auth token only in CI/deployment secrets:

```env
SENTRY_AUTH_TOKEN="set-in-deployment-secrets"
```

Never commit `SENTRY_AUTH_TOKEN`, `.env.sentry-build-plugin`, or real DSNs/tokens.

## Notes

- `Dockerfile` uses `bun install --frozen-lockfile --ignore-scripts` so install-time scripts do not require a live DB during image build.
- Prisma client is generated during image build.
- Migrations run at container startup.
- Local upload data, logs, screenshots, `.next/`, `.pi/`, `.browser/`, `graphify-out/`, `storybook-static/`, and coverage artifacts must stay untracked.
