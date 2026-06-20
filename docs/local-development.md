# Local Development

UMKM Cepat uses a hybrid local development setup:

- Next.js app runs locally with `npm run dev` for reliable hot reload.
- Postgres runs in Docker via WSL so Windows does not need a manual PostgreSQL install.
- Production still uses full Docker.

## Requirements

- Node.js 22 (`.nvmrc` is provided)
- npm 10+
- WSL Docker for infrastructure containers

## Install

```bash
npm install
cp .env.example .env
```

## Start Postgres in Docker

From WSL or any shell that can access WSL Docker:

```bash
cd /mnt/d/Code/Side/umkmcepat
docker compose up -d postgres
```

Default local database URL:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/umkmcepat?schema=public"
```

Apply Prisma migrations:

```bash
npm run db:migrate
```

If a local Docker volume already had tables before migrations existed, baseline once:

```bash
npx prisma migrate resolve --applied 20260620131000_init
npm run db:migrate
```

## Start Next.js locally

```bash
npm run dev
```

Open `http://localhost:3000`.

`npm run dev` is intentionally local, not Dockerized, because hot reload from a Windows drive through WSL bind mounts is slower and less reliable.

If `.next` gets stale or the app shows 500 errors for missing manifest files:

```bash
npm run dev:clean
```

## Optional Redis

Redis is reserved for future queue/rate-limit work.

```bash
docker compose --profile redis up -d redis
```

## Logs

Local automation should write to a single ignored file when needed:

```bash
npm run dev > .dev.log 2>&1
```

`.gitignore` ignores local logs and browser/factory artifacts.
