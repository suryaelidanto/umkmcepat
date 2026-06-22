# Contributing

Thanks for helping build UMKM Cepat.

You can code manually or with an AI agent. Either way, use the same setup, keep changes small, and let the repo guardrails do the boring checks.

## Fast path

After your tools are installed:

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

## 1. Pick your environment

Use one shell consistently for the repo. Do not mix Windows native `node_modules` with WSL `node_modules`.

The Bun version is pinned in `package.json`.

<details>
<summary>Windows with WSL, recommended</summary>

Use Ubuntu on WSL for app commands. Use Docker Desktop with WSL integration enabled.

Install:

- WSL Ubuntu: https://learn.microsoft.com/windows/wsl/install
- Git inside WSL: https://git-scm.com/download/linux
- Bun inside WSL: https://bun.com/docs/installation
- Docker Desktop: https://docs.docker.com/desktop/setup/install/windows-install/
- GitHub CLI inside WSL, if you use GitHub from the terminal: https://cli.github.com/

Verify inside WSL:

```bash
git --version
bun --version
docker version
docker compose version
```

If Docker is not found inside WSL, enable Docker Desktop WSL integration for your Ubuntu distro.

</details>

<details>
<summary>Windows native with Git Bash</summary>

Use Git Bash for repo commands.

Install:

- Git for Windows: https://git-scm.com/download/win
- Bun for Windows: https://bun.com/docs/installation
- Docker Desktop: https://docs.docker.com/desktop/setup/install/windows-install/
- GitHub CLI, if you use GitHub from the terminal: https://cli.github.com/

Verify in Git Bash:

```bash
git --version
bun --version
docker version
docker compose version
```

If you use PowerShell for one-off commands, the env copy command is:

```powershell
Copy-Item .env.example .env
```

</details>

<details>
<summary>macOS</summary>

Install:

- Git: https://git-scm.com/download/mac
- Bun: https://bun.com/docs/installation
- Docker Desktop: https://docs.docker.com/desktop/setup/install/mac-install/
- Colima, if you prefer a lighter local Docker runtime: https://github.com/abiosoft/colima
- GitHub CLI, if you use GitHub from the terminal: https://cli.github.com/

Verify:

```bash
git --version
bun --version
docker version
docker compose version
```

</details>

<details>
<summary>Linux</summary>

Install:

- Git: https://git-scm.com/download/linux
- Bun: https://bun.com/docs/installation
- Docker Engine: https://docs.docker.com/engine/install/
- GitHub CLI, if you use GitHub from the terminal: https://cli.github.com/

Verify:

```bash
git --version
bun --version
docker version
docker compose version
```

If Docker needs sudo, either use `sudo docker ...` consistently or configure Docker rootless/group access using Docker's official docs.

</details>

## 2. Clone and install

```bash
git clone https://github.com/suryaelidanto/umkmcepat.git
cd umkmcepat
bun install
```

This repo uses Bun only. The canonical lockfile is `bun.lock`.

## 3. Configure env

```bash
cp .env.example .env
```

The placeholders are enough for basic local development. Add real credentials only when testing integrations that need them.

## 4. Start the database

```bash
docker compose up -d postgres
bun run db:migrate
```

## 5. Start the app

```bash
bun run dev
```

Open:

```text
http://localhost:3000
```

## 6. Quality gate

Run before opening a PR:

```bash
bun run check
```

This runs formatting, linting, TypeScript, tests, and unused-code checks. The pre-commit hook runs it too.

CI also runs:

```bash
bun run build
```

Run build locally when touching build, Docker, deployment, Next config, or before a release.

## 7. Branches and commits

Create branches from `dev`:

```bash
git checkout dev
git pull origin dev
git checkout -b feat/short-name
```

Use Conventional Commits. The commit hook checks this.

Good:

```text
feat: add project workspace shell
fix: handle missing auth session
docs: clarify setup
chore: update dependencies
```

Open PRs into `dev` first unless maintainers say otherwise.

## 8. UI components

This project uses shadcn/ui-style owned components under `src/components/ui`.

Add new primitives with the official CLI:

```bash
bunx shadcn@latest add button card input
```

Preview before changing existing primitives:

```bash
bunx shadcn@latest add button --dry-run
bunx shadcn@latest add button --diff
```

Use existing local component patterns before adding new primitives.

## Feature-specific setup

### AI generation

Needed when working on prompt generation, model selection, or generated output:

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

### Google login

Needed when testing real sign-in flows. Use this local callback URL:

```text
http://localhost:3000/api/auth/callback/google
```

### Observability

Needed when working on Sentry or monitoring. See [docs/observability.md](docs/observability.md).

## Troubleshooting

### Bun version mismatch

Check the pinned Bun version in `package.json`, then install or upgrade Bun:

```bash
bun --version
```

### Docker is not running

Start Docker Desktop or Docker Engine, then retry:

```bash
docker version
docker compose version
```

### Stale Next.js build output

Stop the dev server, remove `.next`, then restart:

```bash
rm -rf .next
bun run dev
```
