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
- Upstash Redis rate limiting
- Cloudinary uploads
- OpenAI integration
- Vitest for unit tests
- ESLint + Husky + lint-staged for quality gates

## Requirements

- Node.js 20+
- npm
- Database compatible with the Prisma schema for full local app usage

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local` with local values. Do not commit real secrets.

Useful env vars:

| Name | Purpose | Required for |
| --- | --- | --- |
| `DATABASE_URL` | Prisma database connection | DB-backed app flows |
| `AUTH_SECRET` | NextAuth signing secret | Auth |
| `AUTH_URL` | Local auth URL | Auth |
| `OPENAI_API_KEY` | AI generation | AI features |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account | Image upload |
| `CLOUDINARY_API_KEY` | Cloudinary API key | Image upload |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | Image upload |
| `UPSTASH_REDIS_REST_URL` | Redis REST endpoint | Rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Redis REST token | Rate limiting |
| `SENTRY_AUTH_TOKEN` | Sentry release upload | Sentry deploys only |

## Development

```bash
npm run dev
```

Open `http://localhost:3000`.

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
- Live AI, payment, domain, database, Cloudinary, Upstash, and Sentry credentials must stay outside the repo.

## Testing scope

Default tests avoid paid/live external services. Add unit tests for pure logic and mocked integration tests for API behavior. Real AI generation, payment, domain registration, and production-like flows should be tested only with approved credentials and safe sandbox accounts.

## Contributing

1. Create a branch from `main`.
2. Keep changes focused and documented.
3. Add or update tests for behavior changes.
4. Run `npm run verify` before opening a PR.
5. Do not commit secrets or local-only generated files.

## License

License not yet specified. Add a `LICENSE` file before broad public distribution.
