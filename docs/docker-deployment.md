# Docker deployment

UMKM Cepat uses different runtime strategies for development and production.

## Development architecture

Use local Node.js for the Next.js dev server and Docker only for infrastructure:

```text
Host/local Node.js: bun run dev
WSL Docker:        postgres container
```

This keeps hot reload fast and avoids Windows-drive bind mount issues with Next.js `.next` cache and file watching.

Start local infrastructure:

```bash
docker compose up -d
bun run db:migrate
```

Start the app locally:

```bash
bun run dev
```

## Production architecture

Production should use full Docker for the app and infrastructure:

```text
Docker Compose:
  app container:      Next.js production server
  postgres container: database, unless using managed Postgres
  9router container:  AI gateway dashboard/API
  headroom container: context compression proxy for 9Router
  uploads volume:     local upload persistence, unless using S3/R2
```

Deploy on a VPS:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Production Compose binds public-facing services to localhost only:

```text
app:     127.0.0.1:3000
9Router: 127.0.0.1:20129
```

Put Cloudflare Tunnel, Cloudflare Access, Nginx, Caddy, or another reverse proxy in front of them. Postgres and Headroom are internal-only.

## Planned ingress

The preferred production ingress is Cloudflare Tunnel from the VPS, with Cloudflare Access protecting the 9Router dashboard.

```text
umkmcepat.com          -> cloudflared on VPS -> http://localhost:3000
www.umkmcepat.com      -> cloudflared on VPS -> http://localhost:3000
9router.umkmcepat.com  -> Cloudflare Access -> cloudflared on VPS -> http://localhost:20129
```

This keeps app and admin ports bound to localhost on the VPS. The VPS does not need to expose `3000`, `20129`, `8787`, or `5432` publicly.

The app image runs:

```bash
bunx prisma migrate deploy && next start
```

So migrations are applied before the production server starts.

## Required `.env`

Minimum production-like values:

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
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="replace-with-strong-db-password"
POSTGRES_DB="umkmcepat"
```

For VPS, change `POSTGRES_PASSWORD`. Do not expose Postgres or Headroom publicly.

If Headroom compression is enabled in 9Router, use this Docker-internal proxy URL:

```text
http://headroom:8787
```

## Notes

- `Dockerfile` uses `bun install --frozen-lockfile --ignore-scripts` so install-time scripts do not require a live DB during image build.
- Prisma client is generated during image build.
- Migrations run at container startup.
- If local dev returns 500 errors with missing `.next` manifest files, stop the dev server, remove `.next`, then run `bun run dev` again.
