# Local Development

Run local infrastructure with Docker Compose.

## Postgres

```bash
docker compose up -d postgres
```

Default local database URL:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/umkmcepat?schema=public"
```

## Optional Redis

Redis is reserved for future queue/rate-limit work.

```bash
docker compose --profile redis up -d redis
```

## App

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.
