# AGENTS.md

Rules for AI agents and automated contributors.

## Read first

- Read `README.md`, `CONTRIBUTING.md`, `DEV.md`, `ANTI_AI_SLOP.md`, `.env.example`, `package.json`, and `CODEBASE-INDEX.md` before code changes.
- Read `ANTI_AI_SLOP.md` before docs, copy, UI, prompts, or agent-facing instructions.
- Read `DESIGN.md` before UI, styling, layout, typography, colors, or components.
- Read `docs/project-architecture.md` before project, workspace, renderer, publishing, multi-tenant, or user-generated app work.
- Read `docs/9router.md` before AI gateway or model work.
- Read `docs/provider-architecture.md` and `docs/providers.md` before provider/config changes.
- Read `docs/observability.md` before Sentry/monitoring changes.

## Operating mode

- Work like a project engineer, not a one-off script runner.
- Work as the supervising senior engineer/PM by default: keep the helicopter view, define the plan/interfaces/risks, then delegate focused execution to subagents.
- Use pi-subagents as the default execution mindset for coding work: parent agent orchestrates, child agents investigate/plan/implement/review.
- Prefer this loop for non-trivial work: `scout` for codebase context → `planner` for implementation plan → ask user before production-critical edits → `worker` for implementation → fresh `reviewer` for review → parent synthesizes and applies only correct, minimal, in-scope fixes.
- Use parallel subagents when safe and useful, especially for independent review angles: correctness, tests, security, unnecessary complexity, UI/accessibility.
- Keep parent-agent responsibility: do not blindly accept subagent output; verify scope, architecture fit, repo rules, and final quality gate.
- Skip subagents only for trivial one-line fixes, pure explanations, quick file reads, or when the user explicitly says no subagents.
- Follow `CONTRIBUTING.md` for contributor workflow.
- Follow `DEV.md` for maintainer and agent SOP.
- Prefer repo guardrails over personal habits.

## Docs policy

- Do not update every doc "just in case".
- Update the smallest doc set that matches the changed behavior, setup, env, provider, deployment, monitoring, or UI rule.
- If a doc is stale, fix it in the same change or delete it when it no longer has a clear owner.
- Keep `README.md` product-facing and timeless. Put setup in `CONTRIBUTING.md`, maintainer SOP in `DEV.md`, and topic details in `docs/`.
- Prefer one canonical doc plus links over duplicated instructions.
- Keep `CODEBASE-INDEX.md` current when meaningful context changes: product flow, architecture, routes, DB/indexing, provider boundaries, security assumptions, or tradeoffs.
- Always update the `CODEBASE-INDEX.md` change log for meaningful changes future fresh-context agents must know; skip only trivial copy, formatting, or no-behavior edits.
- Always update `CHANGELOG.md` for meaningful user-visible or workflow-relevant changes. Keep it daily, general, and one-line-per-change so it stays useful for quick reporting.

## Language

- Developer-facing docs, code names, comments, logs, errors, PRs, and commits use English.
- End-user product UI copy uses Indonesian unless an i18n layer is introduced.
- New repeated user-facing strings should be easy to move into i18n later.

## Engineering bar

- Keep changes small, focused, and easy to review.
- Prefer deleting/reusing code over adding abstractions.
- Extract reusable code only after a second real use case appears.
- Prefer standard platform tools over custom scripts.
- Do not add code comments unless they explain non-obvious constraints, security decisions, or platform quirks.
- Do not add dependencies unless existing code or platform features are insufficient.
- Keep provider-specific SDKs behind internal adapters in `src/lib`.
- Use TDD for behavior changes: one failing behavior test, minimal implementation, repeat.
- Do not require one test file per source file. Test behavior boundaries and non-trivial logic.

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
- Basic infrastructure runs with `docker compose up -d`.
- AI infrastructure runs with `docker compose --profile ai up -d`.
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
