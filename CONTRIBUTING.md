# Contributing

Thanks for helping UMKM Cepat. Keep changes focused, useful, and easy to review.

## Requirements

- Git
- Bun, pinned in `package.json`
- Docker with Compose
- Signed [CLA.md](CLA.md) (Contributor License Agreement) for any Pull Requests

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
9Router: http://localhost:20129
```

`bun run infra` starts the full local stack (Postgres, Redis, 9Router, Headroom, MinIO). 9Router's default dashboard password is documented in its own project, not here — check it after first boot rather than trusting a copy of it in this repo.

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

- `ROADMAP.md`: the vision, ordered milestones, and where to start.
- `PRINCIPLES.md`: quality bar and operating taste.
- `DEV.md`: maintainer workflow, commands, Storybook, Graphify, checks.
- `DESIGN.md`: visual system and UI rules.
- `docs/superpowers/specs/` and `docs/superpowers/plans/`: the decision trail behind project, runtime, provider, storage, auth, AI-gateway, and deployment behavior.

## Safety

- Do not commit `.env`, secrets, OAuth credentials, provider keys, private data, local uploads, logs, screenshots, `.next/`, `.pi/`, `.browser/`, `graphify-out/`, or coverage artifacts.
- Ask before destructive local operations such as deleting Docker volumes, local uploads, or user files.
- If Docker is missing or stopped, start Docker Desktop or Docker Engine before running infrastructure commands.
