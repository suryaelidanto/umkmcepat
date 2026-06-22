# Local Development

UMKM Cepat uses a hybrid local development setup:

- Next.js runs locally with `npm run dev` for reliable hot reload.
- Postgres runs in Docker.
- 9Router runs in Docker for AI gateway work.
- Production still uses full Docker.

## Requirements

- Node.js 22 (`.nvmrc` is provided)
- npm 10+
- Docker with Compose

Docker can be Docker Desktop, WSL Docker, native Linux Docker, Colima, or another compatible local runtime.

## Install

```bash
npm install
cp .env.example .env
```

Fill `.env` with local placeholders and private credentials.

## Start Postgres

```bash
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

If a reused local Docker volume already had tables before migrations existed, baseline once:

```bash
npx prisma migrate resolve --applied 20260620131000_init
npm run db:migrate
```

## Start 9Router

```bash
docker compose --profile ai up -d 9router
```

Open the 9Router dashboard:

```text
http://localhost:20129/dashboard
```

See `docs/9router.md` for provider/API key setup.

## Start Next.js

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

`npm run dev` intentionally runs outside Docker because local bind-mounted Next.js hot reload can be slower or stale on some host filesystems.

If `.next` gets stale or the app shows missing manifest/chunk errors, stop the dev server, remove `.next`, then run `npm run dev` again.

## Optional Redis

Redis is reserved for future queue/rate-limit work.

```bash
docker compose --profile redis up -d redis
```

## Logs

Run local services in the foreground by default. Developers may redirect logs temporarily for debugging, but log files are local artifacts and must never be committed.
