# Development SOP

Maintainer and agent workflow for UMKM Cepat. For the quality bar, read `PRINCIPLES.md`. For contributor onboarding, start with `CONTRIBUTING.md`.

## Core rules

- Keep changes small and reviewable.
- **Domain before file type** — organize by feature/domain first. Never create generic catch-all folders (`hooks`, `utils`, `helpers`, `misc`). Local hooks, contexts, types, schemas, and helpers stay directly with the feature they serve.
- **Colocated tests by default** — single-module unit/component/route tests sit directly beside the source file (`foo.ts` + `foo.test.ts`). Top-level `tests/` is strictly for cross-domain (`tests/unit`), real DB/Redis infra (`tests/integration/*.itest.ts`), browser/mobile audits (`tests/browser/*.browser.test.ts`), and support harnesses (`tests/support`).
- No any — `any` is lying to the compiler. Use `unknown` + narrowing, define the shape. Never `any`, `as any`, or `ts-ignore`/`eslint-disable` without one-liner why.
- Solid as hell — nothing ships without `typecheck + lint + affected tests` green together. CI is not your safety net. Run `bun run check` before handoff. → See `AGENTS.md` god-tier Rules for single truth.
- **Prefer self-explanatory code over comments.** Write code that says what it does through clear names and structure. Authored comments delete by default; only add a single short one-line comment when it explains a non-obvious invariant, guarded edge case, or deliberate simplification that would otherwise look wrong. Never restate code, narrate the obvious, or use multi-line comment blocks or banner dividers. When a comment becomes unnecessary, delete it; do not leave it "just in case."
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
- Comments explain a non-obvious _why_ in a single short one-liner, never restate code. Self-explanatory names and structure first; delete obvious, restating, banner (`// ---`), or multi-line block comments. `ponytail:` comments mark deliberate simplifications and ceiling — keep them to a single line.
- Prefer deletion over addition: a shallow wrapper removed is a win; a new abstraction for a single implementation or a "later" config value is a loss.
- No new dependencies for what a few lines can do. No interface with one implementation, no factory for one product.
- `ponytail:` comments mark deliberate simplifications and their upgrade ceiling — keep them.
- Deepening opportunities (shallow modules, leaking seams) are surfaced via the `improve-codebase-architecture` skill; each picked candidate is an atomic, gated commit.

## Zero-context codebase architecture & grouping rules

Every human contributor and zero-context AI agent must follow this structure:

### 1. Hierarchy & Domain Organization

- **Domain first, never file type:** Always group by product feature or backend domain (`src/components/admin/`, `src/lib/projects/`).
- **Forbidden catch-all directories:** Never create generic folders like `hooks/`, `utils/`, `helpers/`, `misc/`, `temp/`, or `stuff/`. Feature-local hooks, contexts, types, schemas, and helpers stay directly beside the feature they serve (e.g. `src/components/admin/useStreamerMode.ts` or `src/components/projects/composer-attachments.ts`).
- **Flat by default:** Keep directories flat when they have <15 files. Split into `<feature>/<subfeature>/` only when a sub-domain has 4+ tightly coupled files forming a distinct bounded unit.
- **Shared UI primitives:** Reusable application-wide design system components live in `src/components/ui/`. Domain-specific UI lives in its owning feature directory (`src/components/admin/`, `src/components/projects/`, etc.).

### 2. Test Placement & Decision Tree

- **Colocated tests by default:** Every single-module unit/component/route test sits directly adjacent to its source file:
  - `src/lib/foo.ts` → `src/lib/foo.test.ts`
  - `src/components/Button.tsx` → `src/components/Button.test.tsx`
  - `src/routes/api.payment.ts` → `src/routes/-api.payment.test.ts` (hyphen-prefixed to avoid TanStack router route collision).
- **Top-level `tests/` is strictly partitioned:**
  - `tests/unit/`: Cross-module unit tests spanning multiple domains with no single source owner.
  - `tests/integration/*.itest.ts`: Real DB/Redis/transaction tests requiring backing infrastructure.
  - `tests/browser/*.browser.test.ts`: Live browser, viewport, and mobile audit tests.
  - `tests/support/`: Reusable test harnesses and helpers (excluded from test execution globs).

### 3. Comment Hygiene & Style

- **Code explains itself:** Write clean, expressive identifiers and structure. Authored comments delete by default.
- **Allowed exceptions:** Single-line comments strictly for non-obvious invariants, security edge cases, or deliberate simplifications. Delete narrative comments, restatements, dead code, multi-line blocks, and section dividers.

### 4. Zero-Bypass Type Safety

- **No `any` or `as any`:** Authored code must use `unknown` + narrowing.
- **No `@ts-ignore` or unreviewed suppressions:** Fix the root type contract.
- **Enforcement:** `bun run check` includes `check:discipline` which automatically scans for forbidden directory names, `any`, and unreviewed suppressions across `src/`, `tests/`, and `scripts/`.

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

The app binds `127.0.0.1:3000`; put Cloudflare Tunnel / Nginx / Caddy in front for TLS. Deployment is not configured in GitHub Actions yet; add a dedicated workflow when the VPS is provisioned.

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

`bun run infra` starts full local infra with no Compose profiles: Postgres, Redis (BullMQ), 9Router, Headroom, and MinIO.

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
Canonical project briefs are stored as `ProjectBriefV2`. After deploying the canonical-brief change, preview legacy-row migration with `bun run brief:migrate`, apply it with `bun run brief:migrate --apply`, then rerun preview; the final preview should report zero pending writes. The command prints counts and blocker field identifiers only, never owner values. It preserves accepted historical handoffs while superseding stale draft handoffs and build cards.

When something breaks, an agent (or you) reconstructs the causal chain without copy-pasting logs:

1. **Read `dev.log` at repo root.** Grep for the project id or error string; read the matching `[umkm:scope] event {json}` lines in order. Every event carries a correlation id (`projectId` + `turnId` or request scope) so one id surfaces the full chain — e.g. a discuss turn: `discuss-turn:claim` → `[umkm:ai] discuss:start` → `discuss-turn:finalize`.
2. **Cross-reference infra with Docker logs** for 9Router / Headroom / Postgres failures: `bun run infra:logs` (or `docker compose logs -f`).
3. **Cross-reference raw AI payloads** in `.data/tmp/ai-debug/requests.ndjson` when a model call looks wrong (full request/response bodies that would bloat `dev.log`).
4. **Cross-reference per-request AI metadata** in the `AiCallRecord` table (query by `turnId`/`attemptId`/`projectId`) for latency, served model, tokens, and error class of every upstream call; raw payloads stay in `.data/tmp/ai-debug/requests.ndjson` (dev-only).
5. **For readiness failures, inspect canonical proof identifiers.** Confirm the project brief has `version: 2`, run `evaluateBuildReadiness()`, and compare the accepted handoff's `briefHash` with the attempt input. Do not use model confidence or mutable `project.brief` as build authorization.
6. **Navigate before broad grep.** When Graphify is available, run `bun run graph:update` then read the source tree Graphify returns. If Graphify is unavailable, use targeted `Glob`/`Grep` and document the fallback in handoff.

`dev.log` rotates at ~5 MB to `dev.log.1`; it is never deleted on crash (a crash is when it matters most). Both are gitignored.

## Admin settings (live product knobs)

Non-secret product config lives in `/admin/settings` (DB-first over `.env`). After save the server re-primes the settings snapshot so `getSettingSync` consumers pick up values without process restart. Energy grant is conditional on `feature.waitlist_enabled` (ON = pilot gate: only `approved` waitlist entries receive the one-time signup grant via `linkApprovedWaitlistOnSignup`; OFF = open trial: every new signup receives the grant instantly via `createUser`/`linkAccount`, idempotent via `ON CONFLICT DO NOTHING`); admin emails (`ADMIN_EMAILS`) bypass the gate and always receive the grant instantly even when ON. Default 500,000; there is no automatic refill. Booster packs (`amount`, `compare_at_amount` list price for discount UI, `energy`) resolve via `getBoosterPack` / `GET /api/payment/packs` — change pricing in admin, not hardcoded UI. `feature.composer_uploads_enabled` is the single image switch: ON enables composer attachments, discuss photo questions / `image_upload` cards, and photo-aware generation; OFF disables all of them.

Static generated sites use the outcome-directed agent path. The worker compiles accepted facts into a strict contract before creative model spend; missing identity, offers, a primary visitor job, an actionable CTA, or accepted facts for a secondary route blocks the attempt and returns the owner to discussion. One creative-direction call states the visitor tension and business anchors without choosing colors or layout. The sandboxed build agent reads bundled skills, proposes a contrast-safe semantic design system through `set_design_system`, and owns composition, typography, rhythm, components, and responsive execution. It receives no visual kit, recipe, gold markup, default style dials, or fallback palette.

Selection stays fail closed. Source and browser gates verify facts, unsupported absolute claims, actions, routes, media, build health, contrast, focus, touch targets, links, and overflow at mobile and desktop sizes. One category-complete rendered review must return every category at rating `3-4` with confidence at least `0.80`; unavailable, malformed, incomplete, or low-confidence review output fails. A complete first review below the floor may drive one bounded revision of the existing candidate, followed by all gates and one final review. No source mutation occurs after final review. Any failed candidate preserves the last successful source, Preview, and Production. Build progress and recovery remain in discussion; the owner opens the last successful website explicitly. The tracked `outcome-generation-release.json` stays blocked until 40 treatment trials, all evaluation thresholds, model and prompt version matching, and explicit owner approval pass together. Discuss moderation still must pass before a turn starts, and secrets, OAuth, DB/S3 URLs, and topology remain env-only.

After deploying the one-time-grant migration, preview the existing approved-user reconciliation with `bun run energy:backfill`. Apply it once with `bun run energy:backfill --apply`; the partial unique index makes reruns idempotent. The backfill matches approved waitlist entries to users by normalized email, preserves completed-payment remainder, and reconciles other historical test credit into the 500,000 grant target.

## Environment

`.env.example` is the canonical placeholder list, grouped by concern (app, database, auth, AI, storage, email, payment, analytics, public sites) — read it directly rather than trusting a copy here; a stale duplicate of this block is exactly how past drift happened. If an authenticated API request returns `401`, the client clears the invalid Auth.js session through `/api/auth/signout` and returns to `/`; protected user queries such as energy and support unread count must not be treated as guest-safe because that leaves stale sessions visible. `SessionProvider` also revalidates an authenticated session on focus, reconnect, visible-tab changes, and every 60 seconds.

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

`src/lib/model-pricing.json` is the sole runtime pricing source. Keys are provider-qualified (`openrouter/<provider>/<model>` or `cmc/<provider>/<model>`); legacy bare model IDs resolve as OpenRouter for compatibility. Unknown models use the conservative non-zero floor and log the missing served ID, so energy charging never becomes free. There is no pricing DB cache, startup refresh, cron, or provider API call. Refresh the tracked catalog manually from `https://openrouter.ai/api/v1/models` and `https://commandcode.ai/models`, preserving USD-per-token units and source/check dates.

`STORAGE_PROVIDER` is env-only, not user-configurable: local dev speaks S3 to the MinIO container `bun run infra` starts, and production points the same `S3_*` variables at Cloudflare R2. Set Google OAuth, Turnstile, Chromatic, and AI provider secrets only in `.env` or deployment secrets. Error tracking (Sentry) was intentionally removed; there is currently no error-tracking provider wired.

Generated project runtime artifacts are local by default. `.data/` is ignored by Git; keep canonical `.data/project-artifacts` mounted/persistent for review sessions that must survive restart. Home project thumbnails are derived JPEGs under `.data/project-thumbnails`; keep that directory persistent when thumbnail continuity matters, or let missing images fall back to the deterministic gradient until the next successful build or first preview recovery. Capture and generated-site qualification run in isolated Playwright subprocesses. Install Chromium/Chrome locally; set `PROJECT_THUMBNAIL_BROWSER_PATH` only to override browser discovery. Qualification blocks external requests, checks mobile and desktop, and stores DOM/report JSON plus JPEG evidence privately under S3 `gate-evidence/<projectId>/<candidateId>/`; non-selected evidence expires after 30 days. Evidence refs and owner copy never enter telemetry.

The agentic generator bundles the five project skills through `src/lib/projects/skills/skill-registry.ts` and exposes them through the bounded `read_skill` tool. The four core skills must be read before generated writes or checks; motion guidance is conditional. The tool loop cannot edit protected scaffold files, install packages, call MCP, or fetch a registry. Its final result requires a custom source write and a passing `check_app`; the shared generation-step setting defaults to 40 and stays bounded to 15–60, so a model has room for one repair without an unbounded loop. `check_app` also preflights static anchors and primary-action structure before Vite. Deterministic browser assertions remain blocking; the shadow visual critic may request one bounded correction, but residual subjective findings stay advisory and cannot override facts, routes, or the accepted contract.

To launch a real dashboard-visible build from a terminal, use the route and BullMQ harness rather than calling a worker directly:

```bash
PROJECT_ID=<project-id> bun run build:trigger
```

With a local database, the harness resolves the project owner, active handoff, and review proof, then creates a short-lived local Auth.js JWT without printing it. For a remote app or an explicit session, provide values through a secure environment manager, never tracked files or command history:

```bash
PROJECT_ID=<project-id> \
BUILD_BASE_URL=<app-origin> \
BUILD_AUTH_COOKIE=<auth-cookie> \
BUILD_HANDOFF_ID=<handoff-id> \
BUILD_REVIEW_HASH=<64-char-review-hash> \
bun run build:trigger
```

`BUILD_MODE` accepts `first_generate` or `retry_build`; `BUILD_STREAM_TIMEOUT_MS` is bounded to 30,000–1,800,000 ms. The harness prints only safe SSE progress and terminal status. If its observer disconnects or times out, the server-side bounded worker remains responsible for terminal cleanup and the dashboard can reattach to persisted progress; the harness never bypasses the queue.

To test real discussion stream turns from the terminal, use:

```bash
PROJECT_ID=<project-id> MESSAGE="Halo apa kabar" bun run discuss:trigger
```

Discussion auto-retry uses `discuss.chat.auto_retry_delay_ms` (env `DISCUSS_CHAT_AUTO_RETRY_DELAY_MS`), default 4,000 ms (bounded to 1,000–15,000 ms), providing time for natural stream completion before executing automatic recovery.
Generated command builds use `runtime.generated_build_timeout_ms` (env `PROJECT_GENERATED_BUILD_TIMEOUT_MS`), default 90,000 ms, bounded from 30,000 to 180,000 ms. The default was chosen from the requested project's seven completed builds (19,222 ms succeeded mean, 21,846 ms succeeded p95, 22,138 ms completed maximum) with cold-workspace margin. A command that exceeds the deadline is still a failed build, classified as `timeout`, with no dist artifact; it never replaces a last-known-good Preview or Production pointer.

### Professional static-site V4 benchmark and calibration

Runtime evidence is private and ignored under `.data/generation-evaluation/<run-id>/`; never write it into tracked fixtures. The tracked release manifest is intentionally blocked until private calibration, benchmark evidence, CI, and owner approval exist. Prerequisites are Bun, a configured AI route, a working Vite build, and Chromium/Chrome for browser gates:

```bash
bun run evaluate:generation:run
bun run evaluate:generation:calibration:prepare -- --run-id <run-id>
bun run evaluate:generation:calibration:review -- --run-id <run-id>
# keep reviewer labels and adjudication private; never commit them
bun run evaluate:generation:calibration -- --run-id <run-id> \
  --reviewer-a <private-labels-a.json> \
  --reviewer-b <private-labels-b.json> \
  --adjudication <private-adjudication.json>
bun run evaluate:generation:blind -- --run-id <run-id>
bun run evaluate:generation:report -- \
  --results .data/generation-evaluation/<run-id>/trials.json \
  --preferences .data/generation-evaluation/<run-id>/blind/preferences-v2.json
```

The V4 manifest contains 12 cases, two trials each, and justified `/` plus `/kelas` and `/properti` multi-route fixtures. The runner executes deterministic controls plus the professional-static-v3 writer/build/browser/category-critic pipeline and persists real reports, timings, route patterns, mobile/desktop evidence refs, and hard-failure counts. Infrastructure failures remain in every treatment denominator. Release thresholds are conjunctive: exactly 24 treatment/control pairs, writer=1 and critic=1, correction rate ≤0.20, no hard fact/action/media/accessibility/route/contract failures, no visual `unknown`, every professional category ≥3, total p50 ≤90s and p95 ≤150s, first editable file p50 ≤45s, single-route p95 ≤32KiB, multi-route max ≤48KiB, treatment readiness ≥0.90, decisive treatment preference ≥75%, ties ≤25%, both trials not lost for any case, all five kits, at least two passing multi-route cases, and no route pattern over 50%. The blind HTML keeps arm mapping out of the reviewer view and records readiness separately for A/B; private mapping is applied only during report normalization. Do not change thresholds to bless a failing run. Calibration requires 50 samples, 30 seeded defects across all nine categories, blocker precision ≥0.90, recall ≥0.80, false-ready ≤0.05, P0 false accepts = 0, and both positive/negative category coverage.

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

This runs the lockfile guard, cached route generation, and cached Prettier, ESLint, TypeScript, changed Vitest unit tests, Knip, discipline, and doc-link checks in parallel. Each successful task is keyed by its source, config, lockfile, tool version, and relevant environment. Use `bun run check:uncached` to bypass the local result cache.

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

Generated AI output tests must not pin taste or stochastic wording. Never assert exact model prose, palette hues, font choices, layout structure, card counts, section order, visual-kit or recipe selection, decorative elements, or snapshots of generated source. Test accepted facts, omissions, CTA destinations, routes, package/path policy, compilation, accessibility, browser operability, bounded call budgets, review completeness, and last-known-good preservation. Rendered quality belongs to calibrated visual review and blind corpus evaluation, not exact-response fixtures.

Test behavior boundaries and non-trivial logic, not private implementation details.

## UI workflow

For UI, styling, layout, typography, colors, or components:

1. Read `DESIGN.md`.
2. Reuse `src/components/ui` and design tokens first.
3. Keep visible product copy Indonesian; keep internal prompts English.

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

Gate keys such as `queryKeys.waitlistStatus` use `GATE_QUERY_OPTIONS` (10s stale, refetch on window focus + reconnect). While the user is waitlisted with a pending/waitlisted own entry, the canonical waitlist query polls every 15s and stops after approval, rejection, or no entry. After waitlist submit, admin approval/rejection, or dev waitlist changes, invalidate the shared status query so `/`, `/waitlist`, and the chrome converge without a full browser refresh. Admin waitlist, overview, and nav-count queries use bounded polling plus the same mutation invalidation; this is polling, not a WebSocket/SSE channel. Security gates remain server-owned.

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
