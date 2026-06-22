# Development SOP

This file is the maintainer and agent workflow for UMKM Cepat. For contributor onboarding, start with `CONTRIBUTING.md`.

## Core principles

- Keep changes small and reviewable.
- Prefer deletion and reuse over new abstractions.
- Extract reusable code only after a second real use case appears.
- Use boring platform features before adding dependencies.
- Keep provider-specific code behind internal adapters.
- Keep developer-facing text, code names, comments, logs, errors, docs, and commits in English.
- Keep end-user UI copy in Indonesian unless an i18n layer is introduced.
- Do not add code comments unless they explain non-obvious constraints, security decisions, or platform quirks. Prefer self-explanatory names.
- Do not commit secrets, `.env`, local logs, screenshots, browser artifacts, or generated junk.

## Package manager

Use Bun only. The version is pinned in `package.json`, and `bun.lock` is the canonical lockfile.

## Local runtime

Run the app locally, not inside Docker:

```bash
bun run dev
```

Run infrastructure in Docker:

```bash
bun run infra
bun run infra:ai
```

Inspect infrastructure:

```bash
bun run infra:ps
bun run infra:logs
```

Apply database migrations:

```bash
bun run db:migrate
```

Open:

```text
App:      http://localhost:3000
9Router: http://localhost:20129
```

If Docker is missing, install/start Docker Desktop or Docker Engine. If `.next` gets stale, stop the dev server, remove `.next`, then restart `bun run dev`.

## Environment

Use:

```bash
cp .env.example .env
```

Important local defaults:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/umkmcepat?schema=public"
AI_PROVIDER="9router"
AI_MODELS="cmc/deepseek/deepseek-v4-pro,cmc/deepseek/deepseek-v4-flash,cmc/moonshotai/Kimi-K2.6"
NINE_ROUTER_BASE_URL="http://localhost:20129/v1"
```

`AI_MODELS` is comma-separated. The first model is the default.

## Quality gate

Run this before handoff or PR:

```bash
bun run check
```

This runs:

1. Prettier
2. ESLint with `--max-warnings=0`
3. TypeScript
4. Vitest
5. Knip unused-code/dependency checks

Do not run build during normal development unless explicitly requested or touching build/deployment behavior:

```bash
bun run build
```

The pre-commit hook runs `bun run check`. CI runs `bun run check` and `bun run build`.

## TDD workflow

For behavior changes:

1. Add one behavior test.
2. Watch it fail.
3. Implement the smallest change.
4. Run the targeted test.
5. Repeat.
6. Run `bun run check`.

Tests should verify public behavior, not private implementation details. Do not create one test file per source file by default; test behavior boundaries and non-trivial logic.

## UI workflow

For UI, styling, layout, typography, colors, or components:

1. Read `DESIGN.md`.
2. Reuse `src/components/ui` and existing design tokens first.
3. Keep visible product copy Indonesian.
4. Keep developer/internal text English.
5. Verify in browser with `abk inspect` or `abk review` when available.
6. Include artifact paths in handoff when browser review was used.

## shadcn/ui

Config lives in `components.json`. Components are owned source files under `src/components/ui`.

Add components with the official CLI:

```bash
bunx shadcn@latest add button card input
```

Preview/diff before replacing existing primitives:

```bash
bunx shadcn@latest add button --dry-run
bunx shadcn@latest add button --diff
```

Agent helper, when available:

```bash
bunx skills add shadcn/ui
```

Do not paste raw component source from external pages.

## Providers

- AI runtime: 9Router through `src/lib/ai.ts`
- Storage: `src/lib/storage`
- Rate limit: `src/lib/rate-limit.ts`
- Provider names: `src/lib/provider-registry.ts`

Routes/components should import internal services, not vendor SDKs directly.

## Observability

Sentry is optional locally. See `docs/observability.md`.

Never commit Sentry auth tokens. Use deployment secrets for source-map upload credentials.

## Local artifacts

Run local services in the foreground by default. Temporary logs or pid files created during debugging are local artifacts and must never be committed.

Ignored local paths include:

```text
*.log
*.pid
.browser/
.pi/
.next/
```

Delete stale local artifacts before handoff.

## Final handoff checklist

- `git status --short --untracked-files=all` inspected
- no accidental local artifacts
- no secrets in tracked files
- `bun run check` passed
- `bun run build` passed when required
- browser evidence collected for UI changes
- docs updated for setup/env/workflow changes
