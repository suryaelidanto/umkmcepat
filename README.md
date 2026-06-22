# UMKM Cepat

AI landing-page builder for Indonesian UMKM. The product goal is simple: open the app, describe the business, generate a clean landing page, then publish/share it.

## Stack

- Next.js 15 + React 19
- TypeScript
- Tailwind CSS
- Prisma + PostgreSQL
- NextAuth Google OAuth
- 9Router as the AI gateway
- Vitest, ESLint, Prettier, Knip

## Install prerequisites

| Tool                    | Windows                                                        | macOS                                                      | Linux                                   |
| ----------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------- |
| Git                     | https://git-scm.com/download/win                               | https://git-scm.com/download/mac                           | https://git-scm.com/download/linux      |
| Node.js 22              | https://nodejs.org/en/download                                 | https://nodejs.org/en/download                             | https://nodejs.org/en/download          |
| Docker Desktop / Engine | https://docs.docker.com/desktop/setup/install/windows-install/ | https://docs.docker.com/desktop/setup/install/mac-install/ | https://docs.docker.com/engine/install/ |
| GitHub CLI              | https://cli.github.com/                                        | https://cli.github.com/                                    | https://cli.github.com/                 |

Check versions:

```bash
git --version
node --version
npm --version
docker version
docker compose version
```

Expected:

```text
Node.js >= 22 < 23
npm >= 10
```

## Run locally

1. Install dependencies.

```bash
npm install
```

2. Create local env.

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Start Postgres.

```bash
docker compose up -d postgres
```

4. Apply migrations.

```bash
npm run db:migrate
```

5. Start 9Router for AI work.

```bash
docker compose --profile ai up -d 9router
docker compose ps 9router
```

6. Open 9Router dashboard.

```text
http://localhost:20129
```

Default password:

```text
123456
```

If `docker` is not found, install/start Docker Desktop or Docker Engine first. If port `20129` is already used, stop the other local 9Router/container before starting this project.

7. Configure 9Router.

- Open Providers.
- Add Command Code provider.
- Paste your Command Code API key.
- Save/test provider.
- Create/copy a 9Router API key.
- Put the key in `.env` as `NINE_ROUTER_API_KEY`.

8. Start the app.

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Environment

Important `.env` values:

```env
NEXT_PUBLIC_APP_URL="http://localhost:3000"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/umkmcepat?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="replace-with-local-random-secret"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
AI_PROVIDER="9router"
AI_MODELS="cmc/deepseek/deepseek-v4-pro,cmc/deepseek/deepseek-v4-flash,cmc/moonshotai/Kimi-K2.6"
NINE_ROUTER_BASE_URL="http://localhost:20129/v1"
NINE_ROUTER_API_KEY=""
```

Google OAuth is only needed for login flows. Create credentials at:

```text
https://console.cloud.google.com/apis/credentials
```

Local callback URL:

```text
http://localhost:3000/api/auth/callback/google
```

## AI models

Model list. The first item is the default:

```text
cmc/deepseek/deepseek-v4-pro
cmc/deepseek/deepseek-v4-flash
cmc/moonshotai/Kimi-K2.6
```

Set one or more models with `AI_MODELS`. Use commas to separate multiple models. The first model is used by default.

## Daily commands

```bash
npm run dev                         # start Next.js
docker compose up -d postgres       # start local Postgres
docker compose --profile ai up -d 9router # start local 9Router
npm run db:migrate                  # apply Prisma migrations
npm run db:studio                   # open Prisma Studio
npm run check                       # format, lint, typecheck, tests, dead-code checks
npm run build                       # production build
```

## Quality gate

`npm run check` is strict and fails on:

- Prettier formatting issues
- ESLint warnings/errors
- TypeScript errors
- test failures
- unused files, exports, or dependencies via Knip

GitHub Actions runs `npm run check` and `npm run build` on `dev`, `main`, and PRs into either branch.

## Contributing

1. Branch from `dev`.
2. Keep changes small.
3. Add/update tests for behavior changes.
4. Run:

```bash
npm run check
npm run build
```

5. Commit with Conventional Commits.
6. Open PR into `dev`.

## Security

- Do not commit `.env` or secrets.
- Do not expose provider keys to frontend code.
- Keep 9Router/Command Code keys in `.env` or deployment secrets.
- Use `.env.example` for placeholders only.

## Docs

- `DEV.md` - local workflow
- `CONTRIBUTING.md` - contribution rules
- `docs/9router.md` - AI gateway setup
- `docs/providers.md` - supported provider env values
- `docs/local-development.md` - Docker/local infrastructure
- `docs/docker-deployment.md` - production Docker notes

## License

MIT. See `LICENSE`.
