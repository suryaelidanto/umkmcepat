# Contributing

Thanks for helping UMKM Cepat. Keep changes focused, useful, and easy to review.

## Requirements

- Git
- Bun, pinned in `package.json`
- Docker with Compose

Bun is the only supported package manager.

## Local setup

```bash
git clone https://github.com/suryaelidanto/umkmcepat.git
cd umkmcepat
bun install
cp .env.example .env
bun run infra
bun run db:migrate
bun run dev
```

Open:

```text
http://localhost:3000
```

Optional AI gateway:

```bash
bun run infra:ai
```

```text
9Router: http://localhost:20129
Default password: 123456
```

See `docs/architecture.md` for provider setup.

## Optional agent code map

For non-trivial AI-assisted work, install Graphify outside the project and generate the local graph:

```bash
uv tool install graphifyy
bun run setup:agent
```

`graphify-out/` is ignored by git and must not be committed.

## Before opening a PR

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

## Where to read next

- `PRINCIPLES.md`: quality bar and operating taste.
- `DEV.md`: maintainer workflow, commands, Storybook, Graphify, checks.
- `DESIGN.md`: visual system and UI rules.
- `docs/architecture.md`: project/workspace/renderer/provider/storage/auth/AI constraints.
- `docs/deployment.md`: Docker, VPS, storage persistence, and Sentry setup.

## Safety

- Do not commit `.env`, secrets, OAuth credentials, provider keys, private data, local uploads, logs, screenshots, `.next/`, `.pi/`, `.browser/`, `graphify-out/`, `storybook-static/`, or coverage artifacts.
- Ask before destructive local operations such as deleting Docker volumes, local uploads, or user files.
- If Docker is missing or stopped, start Docker Desktop or Docker Engine before running infrastructure commands.
