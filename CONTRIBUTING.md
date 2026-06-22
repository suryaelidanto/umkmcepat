# Contributing

How do I start contributing?

<details>
<summary>Let AI agent set everything up</summary>

Copy this into your AI coding assistant (Codex, Claude, Cursor, etc.):

<pre><code>You are a smart, effective, and efficient developer setting up UMKM Cepat for another developer. Be proactive. Detect everything you can. Do not ask questions you can answer yourself. Your first goal is simple: get the app running locally with the fewest interruptions.

## Project overview

- Next.js 15, React 19, Tailwind v4, shadcn/ui
- Prisma + PostgreSQL in Docker
- Bun only
- 9Router for AI generation
- Google OAuth for real login flows
- Sentry for monitoring

## Working style

- Start immediately.
- Detect OS, shell, repo state, tools, ports, and running containers yourself.
- Run commands yourself when the environment allows it.
- Ask the user only when a manual action is unavoidable, like starting Docker Desktop or installing Docker.
- Keep updates short. Say what you did, what failed, and the next action.
- Do basic local setup first. After the app runs, offer extra setup for AI generation, login, or monitoring.

## 1. Detect the environment

Run lightweight checks:

  pwd
  uname -a || ver
  git --version
  bun --version
  docker version
  docker compose version

Infer:
- macOS from Darwin
- Linux from Linux
- WSL from Linux plus Microsoft/WSL in uname or /proc/version
- Windows native from MINGW, MSYS, Git Bash, PowerShell, or cmd signals

If Git or Bun is missing, try to install it when safe:
- macOS with Homebrew: brew install git bun
- Debian/Ubuntu/WSL: sudo apt update && sudo apt install -y git, then install Bun with the official Bun install command
- Other Linux: use the distro package manager if obvious
- Windows native: give one clear install link or command if automatic install is not available

If Docker is missing or not running, stop and tell the user exactly what to do:
"Docker is not running. Start Docker Desktop or Docker Engine, then tell me when it is ready."

## 2. Get the code

If the current folder is already the UMKM Cepat repo, use it. Otherwise clone it:

  git clone https://github.com/suryaelidanto/umkmcepat.git
  cd umkmcepat

Check the expected files exist:

  package.json
  bun.lock
  docker-compose.yml
  .env.example

## 3. Install dependencies

Run:

  bun install

If it fails because of network or registry issues, try a registry mirror once:

  bun config set registry https://registry.npmmirror.com
  bun install

If it still fails, ask the user about VPN, proxy, or corporate network restrictions.

## 4. Create local env

If .env does not exist, create it:

  cp .env.example .env

On Windows native if cp is unavailable:

  copy .env.example .env

Do not overwrite an existing .env.

## 5. Start PostgreSQL

Check port 5432 before starting:

Linux/macOS/WSL:
  lsof -i :5432 || ss -tlnp | grep 5432 || echo "5432 free"

Windows native:
  netstat -ano | findstr :5432 || echo "5432 free"

If another process owns 5432, show the user the process and ask before stopping it.

Start Postgres:

  docker compose up -d postgres
  docker compose ps postgres

If it fails:

  docker compose logs postgres

Wait until Postgres is healthy, then run:

  bun run db:migrate

## 6. Start the app

Check port 3000 first:

Linux/macOS/WSL:
  lsof -i :3000 || ss -tlnp | grep 3000 || echo "3000 free"

Windows native:
  netstat -ano | findstr :3000 || echo "3000 free"

If another process owns 3000, show the user and ask before stopping it.

Start the app:

  bun run dev

Verify it is reachable:

Linux/macOS/WSL:
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000

Windows native:
  curl -s http://localhost:3000 || echo "Open http://localhost:3000 in the browser to verify"

Accept 200, 302, or 307 as running.

Tell the user:
"UMKM Cepat is running at http://localhost:3000."

## 7. Offer extras after the app works

After basic setup succeeds, say:
"Local app is ready. I can also set up AI generation, login, or monitoring if you want."

If they want AI generation:

  docker compose --profile ai up -d 9router
  docker compose ps 9router

Then tell them:
"9Router: http://localhost:20129, default password: 123456. Provider setup is in docs/9router.md."

If they want login:
"Google callback URL: http://localhost:3000/api/auth/callback/google."

If they want monitoring:
"Sentry setup is in docs/observability.md."

## 8. Before PRs

When they are ready to contribute:

  bun run check

Tell them:
- Use Conventional Commits
- Open PRs into dev
- Keep changes focused

## 9. Recovery guide

- Docker missing: install Docker Desktop or Docker Engine
- Docker not running: start Docker
- Port busy: identify owner with lsof, ss, or netstat; ask before stopping it
- bun install fails: retry once with registry mirror, then ask about proxy/VPN
- Database fails: docker compose ps postgres, then docker compose logs postgres
- .next errors: stop dev server, delete .next, restart
- Lockfile errors: use Bun only; keep bun.lock; remove package-lock.json, pnpm-lock.yaml, yarn.lock, or bun.lockb

Start now. Do not ask what OS they use. Detect it. Do not ask what they want first. Get the local app running, then offer extras.</code></pre>

</details>

<details>
<summary>Set it up manually</summary>

## Requirements

Install these first:

- Git
- Bun
- Docker with Compose

Bun is the only supported package manager. The pinned version is in `package.json`.

<details>
<summary>Windows</summary>

Use either WSL or Git Bash.

WSL setup:

- WSL Ubuntu: https://learn.microsoft.com/windows/wsl/install
- Bun inside Ubuntu: https://bun.com/docs/installation
- Git inside Ubuntu: https://git-scm.com/download/linux
- Docker Desktop: https://docs.docker.com/desktop/setup/install/windows-install/

Native setup:

- Git for Windows: https://git-scm.com/download/win
- Bun for Windows: https://bun.com/docs/installation
- Docker Desktop: https://docs.docker.com/desktop/setup/install/windows-install/

</details>

<details>
<summary>macOS</summary>

Install:

- Bun: https://bun.com/docs/installation
- Git: https://git-scm.com/download/mac
- Docker Desktop: https://docs.docker.com/desktop/setup/install/mac-install/

Colima also works: https://github.com/abiosoft/colima

</details>

<details>
<summary>Linux</summary>

Install:

- Bun: https://bun.com/docs/installation
- Git: https://git-scm.com/download/linux
- Docker Engine: https://docs.docker.com/engine/install/

If Docker requires sudo, use `sudo docker ...` consistently or configure Docker group/rootless access.

</details>

Check tools:

```bash
git --version
bun --version
docker version
docker compose version
```

## Local setup

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

This gives you a working local app. Continue only with the sections your change needs.

## Feature setup

### AI generation

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

### Login, Sentry, and UI components

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
