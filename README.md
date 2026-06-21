# UMKM Cepat

AI-assisted website and commerce builder for Indonesian UMKM. The app helps small businesses create landing pages, catalogs, and online selling flows faster.

## Status

Early-stage Next.js SaaS codebase prepared for open-source collaboration. Some live integrations require private credentials and are intentionally not exercised in default tests.

## Tech stack

- Next.js 15 / React 19
- TypeScript
- Prisma
- NextAuth
- Tailwind CSS
- Configurable memory rate limiting
- Configurable storage provider: local or S3-compatible providers such as Cloudflare R2
- Configurable AI provider architecture with 9Router as the current runtime gateway
- Vitest for unit tests
- ESLint + Husky + lint-staged for quality gates

## Requirements

- Node.js 20+
- npm
- Database compatible with the Prisma schema for full local app usage

## Setup

```bash
npm install
cp .env.example .env
```

Fill `.env` with local values. Do not commit real secrets.

Useful env vars:

| Name | Purpose | Required for |
| --- | --- | --- |
| `DATABASE_URL` | Prisma database connection | DB-backed app flows |
| `NEXTAUTH_SECRET` | NextAuth signing secret | Auth |
| `NEXTAUTH_URL` | Local auth URL | Auth |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Auth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Auth |
| `AI_PROVIDER` | AI provider selection | AI features |
| `AI_MODEL` | AI model name | AI features |
| `NINE_ROUTER_API_KEY` | 9Router API key | AI features |
| `NINE_ROUTER_BASE_URL` | 9Router OpenAI-compatible endpoint | AI features |
| `STORAGE_PROVIDER` | Storage provider selection | Uploads |
| `S3_ENDPOINT` | S3-compatible endpoint for R2/S3/MinIO | Cloud uploads |
| `S3_BUCKET` | S3-compatible bucket | Cloud uploads |
| `S3_ACCESS_KEY_ID` | S3-compatible access key | Cloud uploads |
| `S3_SECRET_ACCESS_KEY` | S3-compatible secret key | Cloud uploads |
| `S3_PUBLIC_BASE_URL` | Public base URL for uploaded files | Cloud uploads |
| `RATE_LIMIT_PROVIDER` | Rate limit provider selection | Rate limiting |

## Development

Run Postgres in Docker, then run the Next.js dev server locally for reliable hot reload:

```bash
docker compose up -d postgres
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`.

Developer docs:

- `CONTRIBUTING.md` — contribution workflow, branches, commits, PR checklist
- `DEV.md` — local development guide and quality checks
- `AGENTS.md` — rules for AI agents and automated contributors
- `docs/open-source-readiness.md` — security and open-source readiness notes
- `docs/provider-architecture.md` — provider choices, config strategy, and adapter rules
- `docs/providers.md` — supported provider names and env examples
- `docs/local-development.md` — Docker Compose local infrastructure setup
- `docs/docker-deployment.md` — Dockerfile and VPS-style Docker deployment notes

## Quality checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Combined verification:

```bash
npm run verify
```

## Git hooks

Husky runs `lint-staged` before commits. Current staged TypeScript/JavaScript files are linted with autofix. JSON, Markdown, and CSS files are checked with Prettier when Prettier is installed/configured by contributors.

If hooks are not installed after cloning:

```bash
npm run prepare
```

## Security and secrets

- `.env*` files are ignored by git.
- `.env.example` contains placeholders only.
- Never paste real credentials into issues, pull requests, docs, or chat logs.
- Before opening a PR, run a local secret scan or at minimum search tracked files for keys/tokens.
- Live AI, payment, domain, database, storage, and monitoring credentials must stay outside the repo.

## Testing scope

Default tests avoid paid/live external services. Add unit tests for pure logic and mocked integration tests for API behavior. Real AI generation, payment, domain registration, and production-like flows should be tested only with approved credentials and safe sandbox accounts.

## Contributing

Please read `CONTRIBUTING.md` before opening a PR.

Quick rules:

1. Create a branch from `dev`.
2. Use Conventional Commits.
3. Keep changes focused and documented.
4. Add or update tests for behavior changes.
5. Run `npm run verify` before opening a PR.
6. Do not commit secrets or local-only generated files.

## Support the project

Donation and sponsorship links are coming soon.

Any money received for UMKM Cepat will be reinvested into development, servers, AI credits, documentation, contributor support, and ecosystem growth so the project can keep improving for Indonesian UMKM.

See `SPONSORS.md` for details.

## License

MIT. See `LICENSE`.
