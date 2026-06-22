# AGENTS.md

Rules for AI agents and automated contributors.

## Read first

- Read `README.md`, `CONTRIBUTING.md`, `DEV.md`, `ANTI_AI_SLOP.md`, `.env.example`, and `package.json` before code changes.
- Read `ANTI_AI_SLOP.md` before docs, copy, UI, prompts, or agent-facing instructions.
- Read `DESIGN.md` before UI, styling, layout, typography, colors, or components.
- Read `docs/9router.md` before AI gateway or model work.
- Read `docs/provider-architecture.md` and `docs/providers.md` before provider/config changes.
- Read `docs/observability.md` before Sentry/monitoring changes.

## Operating mode

- Work like a project engineer, not a one-off script runner.
- Follow `CONTRIBUTING.md` for contributor workflow.
- Follow `DEV.md` for maintainer and agent SOP.
- Prefer repo guardrails over personal habits.

## Language

- Developer-facing docs, comments, logs, errors, PRs, and commits use English.
- End-user product UI copy uses Indonesian unless an i18n layer is introduced.
- New repeated user-facing strings should be easy to move into i18n later.

## Engineering bar

- Keep changes small, focused, and easy to review.
- Prefer deleting/reusing code over adding abstractions.
- Prefer standard platform tools over custom scripts.
- Do not add dependencies unless existing code or platform features are insufficient.
- Keep provider-specific SDKs behind internal adapters in `src/lib`.
- Use TDD for behavior changes: one failing behavior test, minimal implementation, repeat.

## UI bar

- Follow `DESIGN.md` and existing tokens/components.
- Use shadcn/ui-style owned components in `src/components/ui`.
- For new shadcn primitives, use `bunx shadcn@latest add ...`; do not paste raw component source manually.
- Use browser verification for UI work when available, and cite artifact paths.

## Quality gate

Before handoff, run:

```bash
bun run check
```

Do not run `bun run build` during normal development unless explicitly requested or the change touches build/deployment behavior. It is slower, writes `.next/`, and can interfere with a running dev server. CI still runs build for protected branches.

`bun run check` covers Prettier, ESLint with zero warnings, TypeScript, Vitest, and Knip. Treat it as the default local quality gate.

## Security

- Never commit `.env`, secrets, OAuth credentials, API keys, private keys, Sentry tokens, or private customer data.
- Use `.env.example` for placeholders only.
- Do not print secret values in logs, docs, chat, commits, or PRs.
- Before pushing sensitive changes, grep tracked files for obvious secret patterns.

## Docker/runtime

- Do not assume Docker is available. Check it first when needed.
- App runs with `bun run dev`.
- Postgres runs with `docker compose up -d postgres`.
- 9Router runs with `docker compose --profile ai up -d 9router`.
- If Docker is unavailable, report that clearly instead of inventing status.

## Repository cleanliness

- Do not leave temporary scripts, scratch files, logs, pid files, screenshots, browser artifacts, or generated junk.
- Keep `.browser/`, `.pi/`, `.next/`, logs, and pid files untracked.
- Inspect `git status --short --untracked-files=all` before handoff.

## Git

- Branch from `dev` for normal work.
- Use Conventional Commits.
- Open PRs into `dev` first unless maintainers say otherwise.
- Push `main` only when explicitly requested.
