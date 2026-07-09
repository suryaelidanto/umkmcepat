# Development SOP

Maintainer and agent workflow for UMKM Cepat. For the quality bar, read `PRINCIPLES.md`. For contributor onboarding, start with `CONTRIBUTING.md`.

## Core rules

- Keep changes small and reviewable.
- Keep every developer-facing or internal-facing surface in English: docs, system prompts, agent prompts, code names, comments, logs, errors, test names, commits, scripts, and internal tooling copy.
- Keep only consumer-facing product UI copy in Indonesian unless an i18n layer is introduced.
- Do not commit secrets, `.env`, local logs, screenshots, browser artifacts, uploads, or generated junk.
- Never surface mock, dummy, sample, or deterministic fallback project content as user-facing source, preview, or generated output. If real data/source/build output is unavailable, show an empty/error state and fail honestly.

## Local runtime

Use Bun only. The version is pinned in `package.json`, and `bun.lock` is canonical.

```bash
bun install
cp .env.example .env
bun run infra
bun run db:migrate
bun run dev
```

Verbose development mode:

```bash
bun run dev:verbose
```

Use verbose mode whenever debugging project generation, generated runtime previews, auth/session flow, storage/artifacts, build workers, AI request parsing, or any bug that is not immediately obvious from the UI. It sets `UMKM_VERBOSE_DEV=1` and prints structured terminal lines like `[umkm:scope] event {"key":"value"}`. AI request traces are also appended to `.data/tmp/ai-debug/requests.ndjson` while the local server is running. Keep normal `bun run dev` quiet; add new verbose logs through `src/lib/dev-log.ts` or `src/lib/ai-request-log.ts` instead of raw `console.log`.

If port 3000 is already used by a repo-owned Next dev process, reset it safely:

```bash
bun run dev:reset
```

`dev:reset` only stops a listener whose command line is clearly owned by this repo. If another app owns port 3000, it prints that process information and exits so the owner can stop it manually.

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
PROJECT_ARTIFACT_DIR=".data/project-artifacts"
PROJECT_RUNTIME_DIR=".data/project-runtimes"
PROJECT_RUNTIME_SUPERVISOR="local"
PROJECT_RUNTIME_MAX_CONTAINERS="8"
RATE_LIMIT_PROVIDER="memory"
RATE_LIMIT_GLOBAL_IP_REQUESTS="300"
RATE_LIMIT_GLOBAL_IP_WINDOW_SECONDS="60"
RATE_LIMIT_AI_USER_REQUESTS="60"
RATE_LIMIT_AI_USER_WINDOW_SECONDS="600"
RATE_LIMIT_AI_IP_REQUESTS="20"
RATE_LIMIT_AI_IP_WINDOW_SECONDS="600"
RATE_LIMIT_BUILD_USER_REQUESTS="10"
RATE_LIMIT_BUILD_USER_WINDOW_SECONDS="3600"
RATE_LIMIT_BUILD_IP_REQUESTS="5"
RATE_LIMIT_BUILD_IP_WINDOW_SECONDS="3600"
```

Set Google OAuth, Turnstile, Sentry, Chromatic, and AI provider secrets only in `.env` or deployment secrets.

Generated project runtime artifacts are local by default. `.data/` is ignored by Git; keep it mounted/persistent for local review sessions that need preview cold starts after restart.

Idle runtime cleanup:

```bash
bun run runtime:idle-stop
```

Use this from cron/systemd/timer-equivalent in a single-node deployment until a dedicated worker owns the loop.

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
5. Keep visible product copy Indonesian; keep Storybook/developer chrome and internal prompts English.

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

- Project/runtime/provider/storage/auth/AI gateway changes: `docs/architecture.md`
- Docker/VPS/deployment/monitoring changes: `docs/deployment.md`

Core architecture rule:

```text
one control-plane platform app, many project rows, supervised generated runtimes
```

Do not add per-user platform apps or import generated source files into the Next.js runtime. Per-project runtime containers are allowed only through the snapshot/build/deployment/runtime-supervisor architecture; the production web app must not own the Docker socket.

## Final handoff checklist

- `git status --short --untracked-files=all` inspected.
- No accidental local artifacts.
- No secrets in tracked files.
- Relevant docs updated, or handoff states why docs did not need changes.
- `bun run check` passed.
- `bun run build` passed only when required.
- Browser/UI evidence included when browser review was used.
