# AGENTS.md

Guidance for AI agents and automated contributors working on UMKM Cepat.

## Read first

- Read `README.md`, `CONTRIBUTING.md`, `DEV.md`, `.env.example`, and `package.json` before editing code.
- Read `docs/open-source-readiness.md`, `docs/provider-architecture.md`, `docs/providers.md`, `docs/local-development.md`, and `docs/docker-deployment.md` before setup, infra, provider, or deployment work.
- Read `docs/9router.md` before AI gateway, model, 9Router, or Command Code work.
- Read `DESIGN.md` before UI, styling, layout, typography, color, or component work.
- Follow linked docs when a touched doc points to a more specific workflow.

## Local runtime map

- Run the Next.js dev server locally with `npm run dev`, not in Docker.
- Run Postgres in Docker with `docker compose up -d postgres`.
- Run 9Router in Docker with `docker compose --profile ai up -d 9router`.
- Run `npm run 9router:local` only when local Docker networking does not make `http://localhost:20129` reliable.
- Use `http://localhost:3000` for the app and `http://localhost:20129` for the local 9Router dashboard.
- Use full Docker only for production-style deployment via `docker-compose.prod.yml`.

## Environment and Docker checks

- Do not assume Docker Desktop, native Docker, WSL Docker, Colima, or any specific Docker host.
- Check host OS and Docker availability before running container commands.
- On Windows, check Docker Desktop first, then WSL Docker with `wsl -l -v` if Desktop is unavailable.
- On Linux, use native Docker and Docker Compose when available.
- On macOS, use Docker Desktop, Colima, or the configured local Docker runtime.
- If Docker is unavailable, say so clearly and do not invent container status.
- Distinguish app runtime from infra runtime before diagnosing ports or hot reload.

## Core rules

- Keep changes small, focused, and easy to review.
- Reuse existing code, components, utilities, scripts, and docs before adding new ones.
- Prefer simple readable code over clever abstractions.
- Keep provider-specific code behind internal adapters.
- Keep provider choices configurable through env vars or documented config.
- Never commit secrets, real tokens, private keys, private URLs, or local credentials.
- Do not edit `.env`, production secrets, or private credential files unless explicitly asked.
- Do not run destructive commands unless explicitly requested.
- Do not bypass lint, tests, typecheck, hooks, or security checks.
- Document tradeoffs when uncertain instead of guessing silently.

## Required checks

- Run `npm run lint` before handoff.
- Run `npm run typecheck` before handoff.
- Run `npm run test` before handoff.
- Run `npm run build` after meaningful code, config, provider, or Docker changes.
- Use `npm run verify` when the combined check is appropriate.

## Commit rules

- Use Conventional Commits for every commit.
- Keep commit scope focused on one logical change.
- Let Husky and commitlint run normally.
- Branch from `dev` for normal work.
- Open PRs into `dev` first unless maintainers say otherwise.
- Push to `main` only when explicitly requested.

## Repository cleanliness

- Keep the repo clean for future open-source contributors.
- Delete temporary scripts, scratch files, debug helpers, local logs, screenshots, browser artifacts, and experiment outputs before handoff.
- Keep a script only when it has a durable purpose and is referenced by `package.json` or docs.
- Prefer one ignored log file such as `.dev.log` or `.9router-local.log` when automation needs logs.
- Never commit `.agent/`, `.browser/`, `.pi/`, `.next/`, local logs, cache dirs, or local-only artifacts.
- Run `git status --short --untracked-files=all` before committing or handoff.
- Update `.gitignore` when a new local-only artifact class appears.
- Remove any file that would not make sense to a new contributor six months from now.

## Quality bar

- Add or update tests for behavior changes.
- Keep UI accessible, responsive, and consistent with `DESIGN.md`.
- Keep reusable logic in `src/lib` or shared components.
- Avoid unused dependencies, unused exports, and one-implementation abstractions.
- Do not import provider SDKs directly in routes or components unless creating the adapter.
- Update docs when setup, scripts, env vars, providers, or workflows change.
- Explain skipped live integrations clearly and never fake E2E success.

## Security bar

- Never print or paste secret values in chat, logs, docs, commits, issues, or PRs.
- Use `.env.example` for placeholders only.
- Run a secret scan or tracked-file grep before public/security-sensitive changes.
- Treat AI, auth, payment, domain, database, storage, and monitoring credentials as private.
