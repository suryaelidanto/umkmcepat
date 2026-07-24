# Development SOP

Maintainer and agent workflow for UMKM Cepat. For the quality bar, read `PRINCIPLES.md`. For contributor onboarding, start with `CONTRIBUTING.md`.

## Core rules

- Keep changes small and reviewable.
- **Prefer self-explanatory code over comments.** Write code that says what it does through clear names and structure. Only add a comment when it explains a non-obvious _why_ — an invariant, a guarded edge case, a decision that would otherwise look wrong. Never write a comment that restates the code ("// loop over items" above `for`), narrates the obvious, or splits a section that a function name already communicates. When a comment becomes unnecessary, delete it; do not leave it "just in case."
- Keep every developer-facing or internal-facing surface in English: docs, system prompts, agent prompts, code names, comments, logs, errors, test names, commits, scripts, and internal tooling copy.
- Keep only consumer-facing product UI copy in Indonesian unless an i18n layer is introduced.
- Do not commit secrets, `.env`, local logs, screenshots, browser artifacts, uploads, or generated junk.
- Never surface mock, dummy, sample, inferred, or deterministic fallback content as a successful user-facing AI response, workspace card, implementation spec, project source, preview, or generated output. Preserve last-known-good user data when available; otherwise show an honest empty/error state.
- Recovery order is bounded automatic retry for safe transient failures, then an explicit user-triggered retry. Semantic AI failures (empty text, invalid structured output, incomplete source) must remain failures; never convert them into fabricated success. Manual repair must retry only the failed stage when replaying the full user action could duplicate messages, charges, builds, or side effects.
- Development-only mocks must be explicit and impossible in production. Missing providers, moderation, OTP delivery, storage, or other trust-boundary dependencies must fail clearly instead of returning success.

## Local runtime

Use Bun only. The version is pinned in `package.json`, and `bun.lock` is canonical.

```bash
bun install
cp .env.example .env
bun run infra
bun run db:migrate
bun run dev
```

## Production build & run

The app runs in Docker via `docker-compose.prod.yml` (TanStack Start Nitro server, image `umkmcepat-app:local`). Build once, then run:

```bash
bun run prod:build     # build the production app image (docker compose -f docker-compose.prod.yml build)
bun run prod:up        # bring up app + migrate + postgres + 9router + headroom
bun run prod:logs      # tail production logs
bun run prod:ps        # list production containers
bun run prod:down      # stop production stack (volumes persist)
bun run prod:rebuild   # rebuild + restart (after code changes)
```

The app binds `127.0.0.1:3000`; put Cloudflare Tunnel / Nginx / Caddy in front for TLS. `.github/workflows/deploy.yml` is a backup/disabled deploy workflow (manual-only); uncomment its `push:` trigger when the VPS is provisioned.

Server logs are written to `dev.log` at the repo root automatically during `bun run dev` (no toggle). Tail it live in a second terminal:

```bash
bun run dev:logs
```

If port 3000 is already used by a repo-owned Next dev process, reset it safely:

```bash
bun run dev:reset
```

`dev:reset` only stops a listener whose command line is clearly owned by this repo. If another app owns port 3000, it prints that process information and exits so the owner can stop it manually.

Open:

```text
App: http://localhost:3000
9Router: http://localhost:20129
```

`bun run infra` starts Postgres plus the local AI/observability stack: 9Router and Headroom. Use `bun run infra:minimal` only when you need Postgres without AI/observability.

Useful infrastructure commands:

```bash
bun run infra:ps
bun run infra:logs
bun run infra:down
```

`bun run infra:down` removes the Compose services, any stopped/orphaned container still attached to this project's Docker network, then the network itself. It never removes volumes, so PostgreSQL and 9Router data survive the next `bun run infra`.

Daily workflow:

```bash
bun run infra       # start full local infrastructure
bun run infra:down  # stop all project infrastructure
bun run infra:ps    # inspect status
```

If Docker is missing, install/start Docker Desktop or Docker Engine. If `.next` gets stale, stop the dev server, remove `.next`, then restart `bun run dev`.

## Debugging

When something breaks, an agent (or you) reconstructs the causal chain without copy-pasting logs:

1. **Read `dev.log` at repo root.** Grep for the project id or error string; read the matching `[umkm:scope] event {json}` lines in order. Every event carries a correlation id (`projectId` + `turnId` or request scope) so one id surfaces the full chain — e.g. a discuss turn: `discuss-turn:claim` → `[umkm:ai] discuss:start` → `discuss-turn:finalize`.
2. **Cross-reference infra with Docker logs** for 9Router / Headroom / Postgres failures: `bun run infra:logs` (or `docker compose logs -f`).
3. **Cross-reference raw AI payloads** in `.data/tmp/ai-debug/requests.ndjson` when a model call looks wrong (full request/response bodies that would bloat `dev.log`).
4. **Navigate before you grep.** Run `bun run graph:update` then read the source tree Graphify returns — non-trivial discovery goes through Graphify first, never blind search.

`dev.log` rotates at ~5 MB to `dev.log.1`; it is never deleted on crash (a crash is when it matters most). Both are gitignored.

## Environment

`.env.example` is the canonical placeholder list. Important local defaults:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/umkmcepat?schema=public"
AI_PROVIDER="9router"
NINE_ROUTER_BASE_URL="http://localhost:20129/v1"
OBJECT_STORAGE_PROVIDER="local"
LOCAL_UPLOAD_DIR=".data/uploads"
GENERATED_BUILD_EXECUTION_ENABLED="true"
GENERATED_PUBLIC_EXECUTION_ENABLED="true"
GENERATED_PUBLIC_ORIGIN=""
PROJECT_ARTIFACT_DIR=".data/project-artifacts"
PROJECT_THUMBNAIL_DIR=".data/project-thumbnails"
PROJECT_THUMBNAIL_CAPTURE_ENABLED="true"
PROJECT_THUMBNAIL_BROWSER_PATH=""
PROJECT_RUNTIME_DIR=".data/project-runtimes"
PROJECT_RUNTIME_SUPERVISOR="local"
PROJECT_RUNTIME_MAX_CONTAINERS="8"
PROJECT_RUNTIME_HEALTH_TIMEOUT_MS="2000"
PROJECT_RUNTIME_PROXY_TIMEOUT_MS="15000"
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

Generated project runtime artifacts are local by default. `.data/` is ignored by Git; keep canonical `.data/project-artifacts` mounted/persistent for review sessions that must survive restart. Home project thumbnails are derived JPEGs under `.data/project-thumbnails`; keep that directory persistent when thumbnail continuity matters, or let missing images fall back to the deterministic gradient until the next successful build or first preview recovery. Capture runs in an isolated Node subprocess with a hidden browser window; local Windows uses installed Chrome when `PROJECT_THUMBNAIL_BROWSER_PATH` is empty. Set that path only to override browser discovery. Runtime/build workspaces are rebuildable. Local/test generated execution stays enabled by default; production Compose explicitly disables build and public execution until the isolated-worker and separate-origin gates pass.

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

The pre-commit hook (`scripts/check-staged-fix.ts`) **auto-fixes staged files** before a commit: it runs `prettier --write` + `eslint --fix` on the staged content, re-stages the result, then runs the read-only Prettier + ESLint check. If an unfixable lint error remains, the commit is blocked. It only ever touches staged content — unstaged working-tree changes are snapshotted and restored, so half-written edits never leak into a commit. To run the read-only gate manually (no auto-fix), use `bun scripts/check-staged.ts`.

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
