# Contributing

<details>
<summary>I use an AI coding assistant</summary>

Copy this into your AI assistant (Claude, ChatGPT, Cursor, etc.):

<pre><code>You are helping set up UMKM Cepat, an open-source AI builder for Indonesian small businesses.

## Project overview

- Next.js 15, React 19, Tailwind v4, shadcn/ui
- Prisma + PostgreSQL (Docker)
- Bun only (package manager)
- AI gateway: 9Router (Docker, optional)
- OAuth: NextAuth Google (optional)
- Sentry (optional)

## Setup instructions

### 1. Read the project

Read `package.json`, `bun.lock`, `docker-compose.yml`, `.env.example`, and `CONTRIBUTING.md` from the repo root.

### 2. Detect OS

Ask the user which OS they are on: Windows/WSL, macOS, or Linux.
- If Windows, recommend WSL and check Docker Desktop WSL integration.
- If macOS, recommend Docker Desktop or Colima.
- If Linux, check for Docker Engine and sudo requirements.

### 3. Check tools

Verify Git, Bun, and Docker are installed. If not, guide the user to install them.
- Bun version is pinned in `package.json`.

### 4. Ask focus area

Ask: "What are you working on today?"

- General / docs / UI / tests → basic setup only
- AI generation → basic + 9Router
- Login / auth → basic + Google OAuth
- Monitoring → basic + Sentry
- Everything → all of the above

### 5. Run setup

For basic setup, run:

  git clone https://github.com/suryaelidanto/umkmcepat.git
  cd umkmcepat
  bun install
  cp .env.example .env
  docker compose up -d postgres
  bun run db:migrate
  bun run dev

For AI generation, also run:

  docker compose --profile ai up -d 9router

Then guide the user to:
- Open http://localhost:3000
- For 9Router: open http://localhost:20129, default password is 123456
- Follow docs/9router.md if needed

For Google login: the local callback URL is http://localhost:3000/api/auth/callback/google

For Sentry: see docs/observability.md

### 6. Quality gate

Before the user opens a PR, run:

  bun run check

Remind the user:
- Use Conventional Commits
- Open PRs into the dev branch
- Keep changes small
- The pre-commit hook and CI handle formatting, linting, type checks, tests, and unused code checks

### 7. Troubleshooting

- If Docker is not running, start Docker Desktop or Engine.
- If Bun version is wrong, install the version from package.json.
- If .next is stale, stop the dev server, delete .next, and restart.

Now ask the user for their OS and focus area, then proceed step by step.</code></pre>

</details>

<details>
<summary>I prefer to set things up manually</summary>

## Already have Git, Bun, and Docker?

Run this:

```bash
git clone https://github.com/suryaelidanto/umkmcepat.git
cd umkmcepat
bun install
cp .env.example .env
docker compose up -d postgres
bun run db:migrate
bun run dev
```

Open:

```text
http://localhost:3000
```

This gives you a working local app. Only use the sections below when your change needs them.

## Need the tools?

<details>
<summary>Windows</summary>

WSL is the smoothest path.

Install:

- WSL Ubuntu: https://learn.microsoft.com/windows/wsl/install
- Bun inside Ubuntu: https://bun.com/docs/installation
- Docker Desktop: https://docs.docker.com/desktop/setup/install/windows-install/
- Git inside Ubuntu: https://git-scm.com/download/linux

Then run the setup commands inside Ubuntu.

If you prefer native Windows, use Git Bash with Bun for Windows and Docker Desktop.

</details>

<details>
<summary>macOS</summary>

Install:

- Bun: https://bun.com/docs/installation
- Git: https://git-scm.com/download/mac
- Docker Desktop: https://docs.docker.com/desktop/setup/install/mac-install/

Colima also works if you prefer it: https://github.com/abiosoft/colima

</details>

<details>
<summary>Linux</summary>

Install:

- Bun: https://bun.com/docs/installation
- Git: https://git-scm.com/download/linux
- Docker Engine: https://docs.docker.com/engine/install/

If Docker needs sudo on your machine, use `sudo docker ...` consistently or configure Docker group/rootless access using Docker's docs.

</details>

Quick check:

```bash
git --version
bun --version
docker version
docker compose version
```

## Working on AI generation?

Start 9Router too:

```bash
docker compose --profile ai up -d 9router
```

Open:

```text
http://localhost:20129
```

Default password:

```text
123456
```

Then follow [docs/9router.md](docs/9router.md).

## Working on login, Sentry, or UI components?

- Google login callback: `http://localhost:3000/api/auth/callback/google`
- Sentry setup: [docs/observability.md](docs/observability.md)
- UI components live in `src/components/ui`

Add shadcn/ui primitives with:

```bash
bunx shadcn@latest add button card input
```

Preview existing primitive changes with:

```bash
bunx shadcn@latest add button --dry-run
bunx shadcn@latest add button --diff
```

## Before opening a PR

Run:

```bash
bun run check
```

Use Conventional Commits:

```text
feat: add project workspace shell
fix: handle missing auth session
docs: clarify setup
chore: update dependencies
```

Open PRs into `dev` first unless maintainers say otherwise.

## Troubleshooting

### Docker is not running

Start Docker, then retry:

```bash
docker version
docker compose version
```

### Bun version mismatch

The Bun version is pinned in `package.json`.

```bash
bun --version
```

### Stale Next.js output

Stop the dev server, remove `.next`, then restart:

```bash
rm -rf .next
bun run dev
```

</details>
