# Contributing

<details>
<summary>I use an AI coding assistant</summary>

Copy this into your AI coding assistant (Codex, Claude, Cursor, etc.):

<pre><code>You are helping a developer set up UMKM Cepat, an open-source AI builder for Indonesian small businesses. Your job is to handle the entire onboarding so they can start contributing with minimal effort.

## Project overview

- Next.js 15, React 19, Tailwind v4, shadcn/ui
- Prisma + PostgreSQL (Docker)
- Bun only (package manager)
- AI gateway: 9Router (Docker, optional)
- OAuth: NextAuth Google (optional)
- Sentry (optional)

## Your workflow

### 1. Ask what they want to work on

Start by asking: "What are you working on today?"

- General / docs / UI / tests → basic setup only (fastest)
- AI generation → basic + 9Router
- Login / auth → basic + Google OAuth
- Monitoring → basic + Sentry
- Everything → all of the above

Then ask: "What operating system are you on?"

- Windows / WSL (recommended)
- Windows native
- macOS
- Linux

### 2. Check prerequisites

Verify each tool is installed on their system. Guide them to install any missing tools.

For each command, show the full path if on Windows, otherwise use the default shell.

Check Git:

  git --version

Check Bun:

  bun --version

The expected Bun version is pinned in package.json.

Check Docker:

  docker version --format '{{.Server.Version}}'
  docker compose version

If docker version fails on Linux, try with sudo: sudo docker version

#### Windows specifics

If the user is inside WSL Ubuntu:
- Docker commands work inside WSL. If Docker is not found, enable Docker Desktop WSL integration: open Docker Desktop → Settings → Resources → WSL Integration → enable your Ubuntu distro.
- Git and Bun should be installed inside the WSL environment.

If the user is on Windows native (Git Bash):
- Docker Desktop must be running. Check the system tray.
- Bun for Windows must be installed.
- Git for Windows must be installed.

#### Proxy / corporate network

If git clone or bun install fail with timeout or SSL errors:
- Ask about corporate proxy or VPN
- Try git config --global http.proxy http://proxy:port
- Try bun config set registry https://registry.npmmirror.com or another mirror

### 3. Clone and install

Clone the repo and verify the directory exists:

  git clone https://github.com/suryaelidanto/umkmcepat.git
  cd umkmcepat

Run bun install:

  bun install

If bun install fails:
- Check network connectivity
- Check Bun version: the expected version is in package.json
- On corporate networks, try setting a registry mirror (see section above)

Copy the env file:

  cp .env.example .env

On Windows native: copy .env.example .env

The placeholders in .env.example are enough for local development.

### 4. Start the database

First confirm Docker is running:

  docker version

If Docker is not running:
- On Windows/Mac: ask the user to start Docker Desktop
- On Linux: ask the user to start Docker Engine (sudo systemctl start docker)

Then check port 5432 is free before starting the container:

On Linux / macOS / WSL:
  lsof -i :5432 || ss -tlnp | grep 5432 || echo "Port 5432 is free"

On Windows (PowerShell):
  netstat -ano | findstr :5432 || echo "Port 5432 is free"

If port 5432 is in use, tell the user to stop whatever is using it before continuing.

Start PostgreSQL:

  docker compose up -d postgres

Wait for the container to become healthy. Verify:

  docker compose ps postgres

Expected output shows "Up" and "healthy". If the status is "starting", wait a few more seconds and check again.

If the container fails to start:

  docker compose logs postgres

Common causes: port 5432 already in use, Docker out of disk space, WSL integration not enabled.

Run migrations:

  bun run db:migrate

If migration fails:
- Check the PostgreSQL container is healthy: docker compose ps postgres
- Check DATABASE_URL in .env matches the container config (default is postgresql://postgres:postgres@localhost:5432/umkmcepat?schema=public)

### 5. Start the app

Start the dev server:

  bun run dev

Check if port 3000 is free first:

On Linux / macOS / WSL:
  lsof -i :3000 || ss -tlnp | grep 3000 || echo "Port 3000 is free"

On Windows (PowerShell):
  netstat -ano | findstr :3000 || echo "Port 3000 is free"

If port 3000 is in use, tell the user to stop the other process first.

Verify the app responds:

On Linux / macOS / WSL:
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000

On Windows:
  curl -s http://localhost:3000 | findstr /c:"200" /c:"302" || echo "Check http://localhost:3000 in your browser"

If the response is 200, 302, or 307, the app is running.

Tell the user to open http://localhost:3000 in their browser.

### 6. Add optional services

Only if the user asked for AI generation:

  docker compose --profile ai up -d 9router

Confirm the container started:

  docker compose ps 9router

Expected: "Up"

If it failed:

  docker compose logs 9router

Then:
  - Open http://localhost:20129
  - Default password is 123456
  - Refer to docs/9router.md for provider setup

Only if the user asked for login flows:
  - Local callback URL: http://localhost:3000/api/auth/callback/google
  - Refer to CONTRIBUTING.md for Google OAuth instructions

Only if the user asked for monitoring:
  - Refer to docs/observability.md

### 7. Quality gate

Before the user opens a PR, tell them to run:

  bun run check

This runs format checks, linting, TypeScript, tests, and unused code detection. The pre-commit hook runs it too. CI also runs it.

Remind them:
- Use Conventional Commits (examples: "feat: add X", "fix: handle Y", "docs: clarify Z")
- Open PRs into the dev branch
- Keep changes focused and small

### 8. Common issues reference

When the user encounters an error, identify the issue and suggest the fix:

| Symptom | Likely cause | Fix |
|---|---|---|
| "docker: command not found" | Docker not installed or not in PATH | Install Docker Desktop or Docker Engine |
| "Cannot connect to the Docker daemon" | Docker not running | Start Docker Desktop or sudo systemctl start docker |
| "port is already allocated" | Port 3000 or 5432 in use | Use lsof / netstat to find and stop the process |
| "bun: command not found" | Bun not installed | Install Bun from bun.com/docs/installation |
| "Bun version mismatch" | Wrong Bun version | Install version from package.json |
| "prisma: command not found" | bun install not run | Run bun install first |
| "Can't reach database" | PostgreSQL not started | Check docker compose ps postgres |
| ".next manifest missing" | Stale build cache | Stop dev server, delete .next, restart |
| "ESLint warnings" | Pre-commit hook blocked | Run bun run check and fix issues |

Now begin by asking what they want to work on and their operating system.</code></pre>

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
