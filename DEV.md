# Development SOP

Maintainer and agent workflow for UMKM Cepat. For the quality bar, read `PRINCIPLES.md`. For contributor onboarding, start with `CONTRIBUTING.md`.

## Core rules

- Keep changes small and reviewable.
- No any — `any` is lying to the compiler. Use `unknown` + narrowing, define the shape. Never `any`, `as any`, or `ts-ignore`/`eslint-disable` without one-liner why.
- Solid as hell — nothing ships without `typecheck + lint + affected tests` green together. CI is not your safety net. Run `bun run check` before handoff. → See `AGENTS.md` god-tier Rules for single truth.
- **Prefer self-explanatory code over comments.** Write code that says what it does through clear names and structure. Only add a one-liner `why` when it explains a non-obvious invariant, guarded edge case, or decision that would otherwise look wrong. Never restate code ("// loop over items" above `for`), narrate obvious, or split section that function name already communicates. When comment becomes unnecessary, delete it; do not leave it "just in case."
- Keep every developer-facing or internal-facing surface in English: docs, system prompts, agent prompts, code names, comments, logs, errors, test names, commits, scripts, and internal tooling copy.
- Keep only consumer-facing product UI copy in Indonesian unless an i18n layer is introduced.
- Do not commit secrets, `.env`, local logs, screenshots, browser artifacts, uploads, or generated junk.
- Never write secrets (API keys, access keys, tokens, passwords, account IDs, credentialed connection strings) into `.md`, docs, specs, plans, comments, commits, or fixtures. Env blocks in docs use empty `""` — never real values, not even as a "before" block.
- Never echo `process.env` or secrets to the terminal or `dev.log`. Assume a developer reads every log line live on streaming mode; log a var's name + set/unset boolean, never the value.
- Open-source mindset: this repo is public and seen by millions. Treat every tracked file, commit, and log line as public forever; secrets live only in `.env` (gitignored) or deployment secrets.
- Never surface mock, dummy, sample, inferred, or deterministic fallback content as a successful user-facing AI response, workspace card, implementation spec, project source, preview, or generated output. Preserve last-known-good user data when available; otherwise show an honest empty/error state.
- Recovery order is bounded automatic retry for safe transient failures, then an explicit user-triggered retry. Semantic AI failures (empty text, invalid structured output, incomplete source) must remain failures; never convert them into fabricated success. Manual repair must retry only the failed stage when replaying the full user action could duplicate messages, charges, builds, or side effects.
- Development-only mocks must be explicit and impossible in production. Missing providers, moderation, storage, or other trust-boundary dependencies must fail clearly instead of returning success.

## Cleanliness contract

- Refactors are behavior-preserving only. `bun run check` green before + after every change; a refactor that breaks the gate is reverted, not "fixed forward."
- Comments explain a non-obvious _why_ in one liner, never restate code. Self-explanatory names first; delete obvious/restating/now-unnecessary comments; do not leave them "just in case." `ponytail:` comments mark deliberate simplifications — keep them.
- Prefer deletion over addition: a shallow wrapper removed is a win; a new abstraction for a single implementation or a "later" config value is a loss.
- No new dependencies for what a few lines can do. No interface with one implementation, no factory for one product.
- `ponytail:` comments mark deliberate simplifications and their upgrade ceiling — keep them.
- Deepening opportunities (shallow modules, leaking seams) are surfaced via the `improve-codebase-architecture` skill; each picked candidate is an atomic, gated commit.

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

The app runs in Docker via `docker-compose.prod.yml` (TanStack Start Nitro server, image `ghcr.io/suryaelidanto/umkmcepat-app:${APP_IMAGE_TAG:-latest}`). Build once, then run:

```bash
bun run prod:build     # build the production app image (docker compose -f docker-compose.prod.yml build)
bun run prod:up        # bring up app + migrate + postgres + 9router + headroom
bun run prod:logs      # tail production logs
bun run prod:ps        # list production containers
bun run prod:down      # stop production stack (volumes persist)
bun run prod:rebuild   # rebuild + restart (after code changes)
```

The app binds `127.0.0.1:3000`; put Cloudflare Tunnel / Nginx / Caddy in front for TLS. `.github/workflows/deploy.yml` is a backup/disabled deploy workflow (manual-only with `confirm_deploy=true`); uncomment its `push:` trigger when the VPS is provisioned.

Server logs are written to `dev.log` at the repo root automatically during `bun run dev` (no toggle). Tail it live in a second terminal:

```bash
bun run dev:logs
```

If port 3000 is already used by a repo-owned dev server process, reset it safely:

```bash
bun run dev:reset
```

`dev:reset` only stops a listener whose command line is clearly owned by this repo. If another app owns port 3000, it prints that process information and exits so the owner can stop it manually.

Open:

```text
App: http://localhost:3000
9Router: http://localhost:20129
```

`bun run infra` starts full local infra with no Compose profiles: Postgres, Redis (BullMQ), 9Router, Headroom, and MinIO. Use `bun run infra:minimal` for Postgres + Redis only.

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

If Docker is missing, install/start Docker Desktop or Docker Engine. If the Vite/TanStack Start cache gets stale, stop the dev server, remove `.output`, `.nitro`, and `.tanstack`, then restart `bun run dev`.

## Debugging

Read `dev.log` at the repo root first, then `docker compose logs` for the backing service. UI-side regressions usually need a `bun run dev` tail plus browser console. Discuss turn makes ONE direct call via `getDiscussModel()`; query `AiCallRecord` by `turnId`/`attemptId`/`projectId`. Raw payloads in `.data/tmp/ai-debug/requests.ndjson` (dev-only).
When something breaks, an agent (or you) reconstructs the causal chain without copy-pasting logs:

1. **Read `dev.log` at repo root.** Grep for the project id or error string; read the matching `[umkm:scope] event {json}` lines in order. Every event carries a correlation id (`projectId` + `turnId` or request scope) so one id surfaces the full chain — e.g. a discuss turn: `discuss-turn:claim` → `[umkm:ai] discuss:start` → `discuss-turn:finalize`.
2. **Cross-reference infra with Docker logs** for 9Router / Headroom / Postgres failures: `bun run infra:logs` (or `docker compose logs -f`).
3. **Cross-reference raw AI payloads** in `.data/tmp/ai-debug/requests.ndjson` when a model call looks wrong (full request/response bodies that would bloat `dev.log`).
4. **Cross-reference per-request AI metadata** in the `AiCallRecord` table (query by `turnId`/`attemptId`/`projectId`) for latency, served model, tokens, and error class of every upstream call; raw payloads stay in `.data/tmp/ai-debug/requests.ndjson` (dev-only).
5. **Navigate before broad grep.** When Graphify is available, run `bun run graph:update` then read the source tree Graphify returns. If Graphify is unavailable, use targeted `Glob`/`Grep` and document the fallback in handoff.

`dev.log` rotates at ~5 MB to `dev.log.1`; it is never deleted on crash (a crash is when it matters most). Both are gitignored.

## Admin settings (live product knobs)

Non-secret product config lives in `/admin/settings` (DB-first over `.env`). After save the server re-primes the settings snapshot so `getSettingSync` consumers pick up values without process restart. Energy grant is conditional on `feature.waitlist_enabled` (ON = pilot gate: only `approved` waitlist entries receive the one-time signup grant via `linkApprovedWaitlistOnSignup`; OFF = open trial: every new signup receives the grant instantly via `createUser`/`linkAccount`, idempotent via `ON CONFLICT DO NOTHING`); admin emails (`ADMIN_EMAILS`) bypass the gate and always receive the grant instantly even when ON. Default 500,000; there is no automatic refill. Booster packs (`amount`, `compare_at_amount` list price for discount UI, `energy`) resolve via `getBoosterPack` / `GET /api/payment/packs` — change pricing in admin, not hardcoded UI. Builder photo upload is gated by `feature.builder_photo_enabled` (ON = discuss asks for photos / `image_upload` card; OFF = skips all visuals/image prompts and media strategy).

Generated-site qualification uses `feature.generated_site_quality_rollout`: `off` retains the current batched path; `internal` enables admin-email owners; `pilot` adds approved waitlist owners; `all` enables every landing/marketing build. `interactive_app` remains on its existing implementation-spec path. `quality.generated_site_critic_sample_rate` is clamped to `0..1` and uses deterministic sampling, never `Math.random()`. Roll back by setting rollout to `off`; never restore the old tool loop. Secrets, OAuth, DB/S3 URLs, and topology stay env-only and still need an app restart when changed.

After deploying the one-time-grant migration, preview the existing approved-user reconciliation with `bun run energy:backfill`. Apply it once with `bun run energy:backfill --apply`; the partial unique index makes reruns idempotent. The backfill matches approved waitlist entries to users by normalized email, preserves completed-payment remainder, and reconciles other historical test credit into the 500,000 grant target.

## Environment

`.env.example` is the canonical placeholder list, grouped by concern (app, database, auth, AI, storage, email, payment, analytics, public sites) — read it directly rather than trusting a copy here; a stale duplicate of this block is exactly how past drift happened.

### Per-action AI models

Task model ids (9Router labels) are configurable in `/admin/settings` (AI advanced) and env:

| Setting                    | Env                                            | Used for                           |
| -------------------------- | ---------------------------------------------- | ---------------------------------- |
| `ai.models_default`        | `AI_MODELS`                                    | Global fallback (first CSV entry)  |
| `ai.model.moderation`      | `AI_MODEL_MODERATION`                          | Safety gate + chat compaction      |
| `ai.model.discuss`         | `AI_MODEL_DISCUSS`                             | Guided discuss (+ repairs inherit) |
| `ai.model.discuss_hedge_2` | `AI_MODEL_DISCUSS_HEDGE_2`                     | Discuss hedge leg 2 (empty = off)  |
| `ai.model.discuss_hedge_3` | `AI_MODEL_DISCUSS_HEDGE_3`                     | Discuss hedge leg 3 (empty = off)  |
| `ai.model.build`           | `AI_MODEL_BUILD` (alias `AI_GENERATION_MODEL`) | Build pipeline + edit agent        |

Empty task value → default → hardcode `default-combo`. Admin dropdown loads `GET /api/admin/ai-models` → 9Router `GET {NINE_ROUTER_BASE_URL}/models` filtered to `owned_by: "combo"` (not upstream provider models). Create combos in 9Router dashboard with these ids: `default-combo`, `moderation-combo`, `discuss-combo`, `build-combo`.

`STORAGE_PROVIDER` is env-only, not user-configurable: local dev speaks S3 to the MinIO container `bun run infra` starts, and production points the same `S3_*` variables at Cloudflare R2. Set Google OAuth, Turnstile, Chromatic, and AI provider secrets only in `.env` or deployment secrets. Error tracking (Sentry) was intentionally removed; there is currently no error-tracking provider wired.

Generated project runtime artifacts are local by default. `.data/` is ignored by Git; keep canonical `.data/project-artifacts` mounted/persistent for review sessions that must survive restart. Home project thumbnails are derived JPEGs under `.data/project-thumbnails`; keep that directory persistent when thumbnail continuity matters, or let missing images fall back to the deterministic gradient until the next successful build or first preview recovery. Capture and generated-site qualification run in isolated Playwright subprocesses. Install Chromium/Chrome locally; set `PROJECT_THUMBNAIL_BROWSER_PATH` only to override browser discovery. Qualification blocks external requests, checks mobile and desktop, and stores DOM/report JSON plus JPEG evidence privately under S3 `gate-evidence/<projectId>/<candidateId>/`; non-selected evidence expires after 30 days. Evidence refs and owner copy never enter telemetry.

Run `bun run evaluate:generation:quality` after producing 24 runtime trial results at `.data/generation-evaluation/results.json`. The frozen 12-case manifest lives at `fixtures/generation-evaluation/manifest.json`; never write runtime results into fixtures. Release requires all 24 trials, clean-build p50 at most 120 seconds, technical success at least 95%, deterministic quality at least 90%, and zero critical accessibility, broken-action, or fabricated-fact failures. Investigate failures by `attemptId`/candidate snapshot ID in `dev.log`, `ProjectBuild`, `AiCallRecord`, snapshot quality proof, and private gate evidence. Runtime/build workspaces are rebuildable. Local/test generated execution stays enabled by default; production Compose explicitly disables build and public execution until the isolated-worker and separate-origin gates pass.

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

This runs lockfile guard, Prettier, ESLint, TypeScript, changed Vitest unit tests, Knip, and doc-link checks in parallel.

The pre-commit hook (`scripts/check-staged-fix.ts`) **auto-fixes staged files** before a commit: it runs `prettier --write` + `eslint --fix` on the staged content, re-stages the result, then runs the read-only Prettier + ESLint check. If an unfixable lint error remains, the commit is blocked. It only ever touches staged content — unstaged working-tree changes are snapshotted and restored, so half-written edits never leak into a commit. To run the read-only gate manually (no auto-fix), use `bun scripts/check-staged.ts`.

Do not run build during normal development unless requested or touching build/deployment behavior:

```bash
bun run build
```

CI runs route generation, Storybook build/tests, optional Chromatic, `bun run build`, `bun run verify`, generated-file diff check, then `bun run test:integration` against a real database.

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

## Client data cache (TanStack Query)

Hybrid model: **route loaders / `createServerFn`** own auth gates, ban checks, admin allowlist, and first paint. **TanStack Query** owns mutable client status after load.

Gate keys such as `queryKeys.waitlistStatus` use `GATE_QUERY_OPTIONS` (10s stale, refetch on window focus + reconnect). While the user is waitlisted with a pending/waitlisted own entry, waitlist status polls every 30s. After waitlist submit or dev waitlist changes, call `invalidateWaitlistStatus` so `/` chrome updates without a full browser refresh.

Do not migrate security gates fully to client-only queries.

## Architecture docs

There is no single standing architecture/deployment doc. Before touching project, runtime, provider, storage, auth, AI gateway, Docker, VPS, or monitoring behavior:

- Check `docs/superpowers/specs/` and `docs/superpowers/plans/` for the design that shaped the area you're changing — they're the decision trail, not just history.
- Read the key modules directly: `src/lib/s3-client.ts` (storage), `src/lib/auth.ts` (auth), `src/lib/ai.ts` (AI gateway), `src/lib/projects/runtime-*` (runtime supervisor), `docker-compose.prod.yml` (deployment topology).

Core architecture rule:

```text
one control-plane platform app, many project rows, supervised generated runtimes
```

Do not add per-user platform apps or import generated source files into the control-plane runtime. Per-project runtime containers are allowed only through the snapshot/build/deployment/runtime-supervisor architecture; the production web app must not own the Docker socket.

## Final handoff checklist

- `git status --short --untracked-files=all` inspected.
- No accidental local artifacts.
- No secrets in tracked files.
- Relevant docs updated, or handoff states why docs did not need changes.
- `bun run check` passed.
- `bun run build` passed only when required.
- Browser/UI evidence included when browser review was used.
