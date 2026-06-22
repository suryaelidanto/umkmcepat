# Contributing

Thanks for helping make UMKM Cepat better.

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

That is enough for most work.

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
