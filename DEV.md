# Development SOP

Maintainer and agent workflow for UMKM Cepat. For the quality bar, read `PRINCIPLES.md`. For contributor onboarding, start with `CONTRIBUTING.md`.

## Core rules

- Keep changes small and reviewable.
- Keep developer-facing docs, code names, comments, logs, errors, and commits in English.
- Keep end-user UI copy in Indonesian unless an i18n layer is introduced.
- Do not commit secrets, `.env`, local logs, screenshots, browser artifacts, uploads, or generated junk.

## Local runtime

Use Bun only. The version is pinned in `package.json`, and `bun.lock` is canonical.

```bash
bun install
cp .env.example .env
bun run infra
bun run db:migrate
bun run dev
```

Open:

```text
App: http://localhost:3000
```

Optional AI gateway:

```bash
bun run infra:ai
```

```text
9Router: http://localhost:20129
```

Useful infrastructure commands:

```bash
bun run infra:ps
bun run infra:logs
bun run infra:down
```

If Docker is missing, install/start Docker Desktop or Docker Engine. If `.next` gets stale, stop the dev server, remove `.next`, then restart `bun run dev`.

## Environment

`.env.example` is the canonical placeholder list. Important local defaults:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/umkmcepat?schema=public"
AI_PROVIDER="9router"
NINE_ROUTER_BASE_URL="http://localhost:20129/v1"
OBJECT_STORAGE_PROVIDER="local"
LOCAL_UPLOAD_DIR=".data/uploads"
RATE_LIMIT_PROVIDER="memory"
```

Set Google OAuth, Turnstile, Sentry, Chromatic, and AI provider secrets only in `.env` or deployment secrets.

## Graphify

Graphify is recommended for non-trivial discovery and reuse checks. It is user-local, not a project dependency.

```bash
uv tool install graphifyy
bun run setup:agent
bun run graph:update
```

Then read the source files Graphify returns. Do not treat Graphify output as a replacement for source or canonical docs.

## Quality gate

Run before handoff or PR:

```bash
bun run check
```

This runs lockfile guard, Prettier, ESLint, TypeScript, Vitest, and Knip.

Do not run build during normal development unless requested or touching build/deployment behavior:

```bash
bun run build
```

CI runs `bun run check`, `bun run build`, Storybook build/tests, and optional Chromatic.

## TDD workflow

For behavior changes:

1. Add one behavior test.
2. Watch it fail.
3. Implement the smallest change.
4. Run the targeted test.
5. Run `bun run check`.

Test behavior boundaries and non-trivial logic, not private implementation details.

## UI workflow

For UI, styling, layout, typography, colors, or components:

1. Read `DESIGN.md`.
2. Reuse `src/components/ui`, design tokens, and existing stories first.
3. Check Storybook foundations, atoms, molecules, and organisms.
4. Add or update a Storybook story for new reusable UI or meaningful repeated visual states.
5. Keep visible product copy Indonesian.

Storybook:

```bash
bun run storybook
bun run storybook:build
bun run test:storybook
```

```text
Storybook: http://localhost:6006
```

Chromatic requires `CHROMATIC_PROJECT_TOKEN`:

```bash
bun run chromatic
```

## Lighthouse

Local release/performance guardrail only; not CI/CD or pre-commit. See `docs/lighthouse.md` for scope, thresholds, and interpretation.

```bash
bun run lighthouse
bun run lighthouse:mobile
bun run lighthouse:desktop
```

Reports are written to `.lighthouseci/` and ignored by Git.

## shadcn/ui

Config lives in `components.json`. Owned primitives live under `src/components/ui`.

```bash
bunx shadcn@latest add button card input
bunx shadcn@latest add button --dry-run
bunx shadcn@latest add button --diff
```

Do not paste raw component source from external pages.

## Architecture docs

Read the relevant doc before touching that area:

- Architecture/provider/storage/auth/AI gateway changes: `docs/architecture.md`
- Docker/VPS/deployment/monitoring changes: `docs/deployment.md`

Core architecture rule:

```text
one platform app, many project rows, one shared renderer
```

Do not add per-user apps, per-project containers, arbitrary user backend code, or generated source files as the primary platform runtime.

## Final handoff checklist

- `git status --short --untracked-files=all` inspected.
- No accidental local artifacts.
- No secrets in tracked files.
- Relevant docs updated, or handoff states why docs did not need changes.
- `bun run check` passed.
- `bun run build` passed only when required.
- Browser/UI evidence included when browser review was used.
