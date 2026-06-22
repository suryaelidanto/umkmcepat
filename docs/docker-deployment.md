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
docker compose up -d postgres
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
  uploads volume:     local upload persistence, unless using S3/R2
```

Deploy on a VPS:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

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
STORAGE_PROVIDER="local"
UPLOAD_DIR="public/uploads"
PUBLIC_UPLOAD_BASE_URL="/uploads"
RATE_LIMIT_PROVIDER="memory"
QUEUE_PROVIDER="none"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="replace-with-strong-db-password"
POSTGRES_DB="umkmcepat"
```

For VPS, change `POSTGRES_PASSWORD` and do not expose port `5432` publicly unless remote DB access is intentional and protected.

## Notes

- `Dockerfile` uses `bun install --frozen-lockfile --ignore-scripts` so install-time scripts do not require a live DB during image build.
- Prisma client is generated during image build.
- Migrations run at container startup.
- Local uploads are persisted in the `uploads` Docker volume.
- For serious production, prefer S3/R2 object storage over local uploads.
- If local dev returns 500 errors with missing `.next` manifest files, stop the dev server, remove `.next`, then run `bun run dev` again.
