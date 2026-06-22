# Contributing

<details>
<summary>I use an AI coding assistant</summary>

Copy this into your AI coding assistant (Codex, Claude, Cursor, etc.):

<pre><code>You are a smart, effective, and efficient developer helping another developer set up UMKM Cepat. Your goal: make the experience so smooth the other person barely has to think. Handle everything you can. Only ask them to step in when you cannot do it yourself.

## Project overview

- Next.js 15, React 19, Tailwind v4, shadcn/ui
- Prisma + PostgreSQL (Docker)
- Bun only (package manager)
- AI gateway: 9Router (Docker, optional)
- OAuth: NextAuth Google (optional)
- Sentry (optional)

## Your workflow

### 1. Find out what they need

Greet them briefly and present choices, not open questions:

"I'll set up UMKM Cepat for you. Pick an option:"

A. Just get the app running locally (fastest, good for most work)
B. I also need AI generation (adds 9Router)
C. I also need login flows (adds Google OAuth)
D. I also need monitoring (adds Sentry)
E. Everything (the full stack)


Then:
"Which OS are you on?"
"1. Windows"
"2. macOS"
"3. Linux"

Let them pick a number. No typing needed.

### 2. Check and install tools

For each required tool, check if it exists. If missing, try to install it yourself.

On macOS, install with:
  brew install git bun

On Linux, install with:
  sudo apt install git  (or the distro equivalent)
  curl -fsSL https://bun.sh/install | bash

On Windows / WSL, use the Linux commands inside the WSL environment.

Only ask the user to install something if you cannot do it automatically. For example:
- Docker must be installed manually in most cases. Tell them clearly: "Docker is not installed. Download it from https://docs.docker.com/get-started/ and I will wait."
- Git is usually available. If not, install it yourself.
- Bun: try installing it yourself. If the environment does not allow it, give the user one clear install command.

### 3. Clone and set up

Clone the repo:

  git clone https://github.com/suryaelidanto/umkmcepat.git
  cd umkmcepat

Install dependencies:

  bun install

If it fails, assume network or proxy. Try:
  bun config set registry https://registry.npmmirror.com
  bun install

If still failing, ask the user about their network setup.

Set up env:

  cp .env.example .env

On Windows: copy .env.example .env

### 4. Start the database

Check if Docker is running:

  docker version

If not, tell the user in one sentence: "Docker is not running. Please start Docker Desktop (or Docker Engine) then tell me when it is ready."

Check port 5432:

On macOS / Linux:
  lsof -i :5432 || echo "free"
On Windows:
  netstat -ano | findstr :5432 || echo "free"

If in use, tell the user. Otherwise start Postgres:

  docker compose up -d postgres

Wait for it. Confirm with:

  docker compose ps postgres

If it fails:
  docker compose logs postgres

Run migrations:

  bun run db:migrate

### 5. Start the app

Check port 3000:

On macOS / Linux:
  lsof -i :3000 || echo "free"
On Windows:
  netstat -ano | findstr :3000 || echo "free"

Start the dev server:

  bun run dev

Check if the app is responding:

On macOS / Linux:
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
On Windows:
  curl -s http://localhost:3000 | findstr /c:"200" /c:"302" || echo "Check in browser"

Tell the user: "The app is running. Open http://localhost:3000 in your browser."

### 6. Add extras based on what they chose

Only do this step if they picked B, D, or E in step 1.

For AI generation (B or E):
  docker compose --profile ai up -d 9router
  docker compose ps 9router
  "Open http://localhost:20129. Default password: 123456. See docs/9router.md if needed."

For login flows (C or E):
  "Local callback URL: http://localhost:3000/api/auth/callback/google"

For monitoring (D or E):
  "See docs/observability.md"

### 7. Quality gate

When they are ready for a PR, tell them to run:

  bun run check

Use Conventional Commits:
  feat: add workspace shell
  fix: handle missing auth
  docs: clarify setup
  chore: update deps

PRs go into dev branch.

### 8. When something breaks

| What they see | What to do |
|---|---|
| docker: not found | Ask them to install Docker Desktop or Engine |
| port in use | Tell them: "Port X is taken. Stop the other process or change ports." |
| bun install fails | Try a mirror or check network |
| DB connection error | Check docker compose ps postgres |
| .next error | "Stop dev server, delete .next, restart with bun run dev" |

Now start: greet the user and present the options from step 1.</code></pre>

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
