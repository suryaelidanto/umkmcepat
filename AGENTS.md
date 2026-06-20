# AGENTS.md

Guidance for AI agents and automated contributors working on UMKM Cepat.

## Read first

If work touches design, UI, styling, layout, typography, colors, or components, read `DESIGN.md` first and keep changes consistent with it.

Before editing code, read these files:

- `README.md` — project overview, setup, scripts, security basics
- `CONTRIBUTING.md` — branch, commit, PR, review rules
- `DEV.md` — local development workflow and quality checks
- `docs/open-source-readiness.md` — security/open-source notes
- `docs/provider-architecture.md` — provider/configuration strategy and adapter rules
- `docs/providers.md` — supported provider names and env examples
- `docs/local-development.md` — Docker Compose local infrastructure setup
- `.env.example` — required environment variables, placeholders only
- `package.json` — available scripts and dependency context

## Environment and Docker checks

- Do not assume Docker access method. Check host OS and available Docker CLI first.
- Windows: check Docker Desktop (`docker version`, `docker context ls`). If unavailable, check WSL Docker (`wsl -l -v`, then run Docker commands inside the active WSL distro when Docker is installed there).
- Linux: use native Docker/Compose if available (`docker version`, `docker compose version`).
- macOS: prefer Docker Desktop or compatible local Docker runtime if installed.
- If Docker is unavailable, report that clearly and avoid inventing container status.
- For local development, distinguish DB-only Docker Compose from app runtime. `docker-compose.yml` may run only infra; app may run separately via `npm run dev`.

## Core rules

- Keep changes small, focused, and easy to review.
- Reuse existing code, components, utilities, and patterns first.
- Prefer simple, readable code over clever abstractions.
- Build one provider first, but keep provider-specific code behind internal adapter boundaries.
- Provider choices must be configurable through environment variables or config files.
- Do not introduce secrets, tokens, private keys, real credentials, or local-only data.
- Do not edit `.env`, `.env.local`, production config, or private credentials.
- Do not run destructive commands unless explicitly requested.
- Do not bypass lint, tests, typecheck, commit hooks, or security checks.
- If unsure, document the tradeoff in the PR instead of guessing silently.

## Required checks

Before proposing a PR or final handoff, run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Use the combined command when appropriate:

```bash
npm run verify
```

## Commit rules

Use Conventional Commits:

```text
feat: add catalog checkout flow
fix: handle missing landing page image
chore: update dependencies
```

Commit messages are checked by Husky + commitlint.

## Repository cleanliness

- Treat this as an open-source project that many developers will clone and maintain.
- Keep the repository clean, understandable, and free of one-off automation leftovers.
- Delete temporary scripts, scratch files, debug helpers, generated throwaway files, local logs, browser artifacts, and experiment outputs before handoff.
- Do not leave ad-hoc files in `scripts/`, `src/`, docs, or project root unless they are intended to be maintained long term and documented.
- If a helper script is kept, it must have a durable purpose, a clear name, and be referenced from `package.json`, docs, or another maintained workflow.
- Prefer one ignored log file for automation, such as `.dev.log`; do not create many numbered or tool-specific log files.
- Never commit `.agent/`, `.pi/`, `.next/`, local logs, temporary screenshots, cache directories, or local-only artifacts.
- Before committing, inspect `git status --short --untracked-files=all` and remove or ignore accidental files.
- Keep `.gitignore` updated when a new local-only artifact class appears.
- Always ask: would this file make sense to a new open-source contributor six months from now? If not, remove it or document it.

## Quality bar

- Add or update tests for behavior changes.
- Keep UI accessible and responsive.
- Keep reusable logic in `src/lib` or shared components when appropriate.
- Avoid unused dependencies and unused exports.
- Do not import provider SDKs directly in routes/components unless no adapter exists yet and the change is explicitly part of creating one.
- Keep docs updated when setup, scripts, env vars, or workflows change.
- Explain skipped live integrations clearly; do not fake E2E success.

## Security bar

- Never print or commit secret values.
- Use `.env.example` for placeholders only.
- Run a secret scan or manual tracked-file grep before public/security-sensitive changes.
- Treat AI, payment, domain, database, storage, and monitoring credentials as private.

## Branching

- Branch from `dev` for normal work.
- Use short branch names: `feat/...`, `fix/...`, `docs/...`, `chore/...`.
- Open PRs into `dev` first unless maintainers say otherwise.
- `main` is the public/stable branch.
