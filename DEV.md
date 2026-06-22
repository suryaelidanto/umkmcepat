# Development Guide

Simple local workflow for UMKM Cepat.

## Requirements

- Node.js 22 (`.nvmrc` is provided)
- npm 10+
- Docker with Compose for infrastructure containers

## Setup

```bash
npm install
cp .env.example .env
npm run prepare
```

Fill `.env` with local values and never commit real secrets.

## Start infrastructure

```bash
docker compose up -d postgres
docker compose --profile ai up -d 9router
npm run db:migrate
```

## Run the app

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

9Router dashboard:

```text
http://localhost:20129/dashboard
```

## Useful scripts

```bash
npm run dev            # local Next.js dev server on port 3000
npm run db:up          # start Postgres container
npm run db:migrate     # apply Prisma migrations
npm run db:studio      # open Prisma Studio
npm run check          # format, lint, typecheck, tests, dead-code checks
npm run build          # production build
npm run docker:prod    # production-style Docker Compose
```

## Git hooks

Husky runs:

- `pre-commit`: lint-staged checks staged files
- `commit-msg`: Conventional Commit validation

If hooks are missing:

```bash
npm run prepare
```

## Branch flow

```bash
git checkout dev
git pull origin dev
git checkout -b feat/short-name
```

After work:

```bash
npm run check && npm run build
git add .
git commit -m "feat: describe the change"
git push origin feat/short-name
```

Open a PR into `dev`.

## Project structure

```text
src/app          Next.js routes and API routes
src/components   Shared UI and feature components
src/lib          Shared utilities, services, schemas
prisma           Database schema and migrations
docs             Project documentation
.agents          Agent skills/instructions
```

## Testing approach

- Unit test pure logic first.
- Mock external services.
- Avoid default tests that require paid APIs or production credentials.
- Live AI, payment, domain, upload, and production deploy flows need maintainer-approved credentials or sandbox accounts.

## Security checklist

Before pushing public work:

```bash
git status --short --untracked-files=all
git grep -n -I -E "sk-|BEGIN .*PRIVATE|DATABASE_URL=|AUTH_SECRET=|API_KEY=|TOKEN=" -- . ':(exclude)package-lock.json'
```

Do not print or paste secret values in PRs, issues, commits, docs, or chat logs.

## Dependency hygiene

- Prefer existing dependencies.
- Remove unused packages.
- Keep security updates focused.
- Avoid major upgrades mixed with feature work.
- Run `npm audit` when touching dependencies.
