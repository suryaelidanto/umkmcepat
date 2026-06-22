# Contributing

Thanks for helping build UMKM Cepat.

This project is optimized for a simple contributor flow: install the standard tools, copy the env file, start local infrastructure, run the app, run the quality gate, then open a small PR.

## Language policy

- Developer-facing docs, code comments, commit messages, PRs, logs, and internal errors use English.
- End-user UI copy for Indonesian UMKM uses Indonesian.
- New user-facing strings should be easy to move into an i18n layer later. Do not scatter repeated copy across many files.

## 1. Install tools

<details>
<summary>Windows</summary>

Install:

- Git: https://git-scm.com/download/win
- Node.js 22: https://nodejs.org/en/download
- Docker Desktop: https://docs.docker.com/desktop/setup/install/windows-install/
- GitHub CLI: https://cli.github.com/

Use PowerShell or Git Bash.

Verify:

```powershell
git --version
node --version
npm --version
docker version
docker compose version
```

If `docker` is not found, start Docker Desktop first.

</details>

<details>
<summary>macOS</summary>

Install:

- Git: https://git-scm.com/download/mac
- Node.js 22: https://nodejs.org/en/download
- Docker Desktop: https://docs.docker.com/desktop/setup/install/mac-install/
- GitHub CLI: https://cli.github.com/

Verify:

```bash
git --version
node --version
npm --version
docker version
docker compose version
```

</details>

<details>
<summary>Linux</summary>

Install:

- Git: https://git-scm.com/download/linux
- Node.js 22: https://nodejs.org/en/download
- Docker Engine: https://docs.docker.com/engine/install/
- GitHub CLI: https://cli.github.com/

Verify:

```bash
git --version
node --version
npm --version
docker version
docker compose version
```

If Docker needs sudo on your machine, either use `sudo docker ...` consistently or configure Docker rootless/group access using Docker's official docs.

</details>

Expected Node/npm:

```text
Node.js >= 22 < 23
npm >= 10
```

## 2. Clone and install

```bash
git clone https://github.com/suryaelidanto/umkmcepat.git
cd umkmcepat
npm install
```

Create local env:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Do not commit `.env`.

## 3. Start local services

Start PostgreSQL:

```bash
docker compose up -d postgres
npm run db:migrate
```

Start 9Router when working on AI flows:

```bash
docker compose --profile ai up -d 9router
docker compose ps 9router
```

Open 9Router:

```text
http://localhost:20129
```

Default password:

```text
123456
```

Then configure the provider and API key using [docs/9router.md](docs/9router.md).

## 4. Start the app

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## 5. Optional integrations

### Google OAuth

Required only for real login flows.

Create credentials at:

```text
https://console.cloud.google.com/apis/credentials
```

Local callback URL:

```text
http://localhost:3000/api/auth/callback/google
```

Set in `.env`:

```env
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

### Sentry

Sentry is optional locally. See [docs/observability.md](docs/observability.md).

## 6. Quality gate

Run before every PR:

```bash
npm run check
npm run build
```

`npm run check` fails on:

- Prettier formatting issues
- ESLint warnings or errors
- TypeScript errors
- test failures
- unused files, exports, or dependencies from Knip

The pre-commit hook also runs:

```bash
npm run check
```

## 7. Branch and commit

Create branches from `dev`:

```bash
git checkout dev
git pull origin dev
git checkout -b feat/short-name
```

Use Conventional Commits:

```text
feat: add project workspace shell
fix: handle missing auth session
docs: clarify 9router setup
chore: update dependencies
```

Open PRs into `dev` first unless maintainers say otherwise.

## 8. UI and shadcn/ui

This project uses shadcn/ui-style owned components under `src/components/ui` with config in `components.json`.

Use the official CLI for new primitives:

```bash
npx shadcn@latest add button card input
```

Preview before changing existing primitives:

```bash
npx shadcn@latest add button --dry-run
npx shadcn@latest add button --diff
```

For AI assistants, the official shadcn skill is useful:

```bash
npx skills add shadcn/ui
```

Do not copy raw component source from the internet manually. Use the CLI or follow existing local component patterns.

## 9. Pull request checklist

- Small focused change
- Tests added or updated for behavior changes
- UI checked in browser when UI changes
- `npm run check` passes
- `npm run build` passes for meaningful code/config changes
- No secrets or local artifacts committed
- Docs updated when setup, env vars, scripts, providers, or workflows change
