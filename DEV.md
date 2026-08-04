# Development SOP

Maintainer and agent workflow for UMKM Cepat. For the quality bar, read `PRINCIPLES.md`. For contributor onboarding, start with `CONTRIBUTING.md`.

## Core rules

- Keep changes small and reviewable.
- **Prefer self-explanatory code over comments.** Write code that says what it does through clear names and structure. Only add a comment when it explains a non-obvious _why_ — an invariant, a guarded edge case, a decision that would otherwise look wrong. Never write a comment that restates the code ("// loop over items" above `for`), narrates the obvious, or splits a section that a function name already communicates. When a comment becomes unnecessary, delete it; do not leave it "just in case."
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
- Comments explain a non-obvious _why_, never restate the code. Delete obvious/restating/now-unnecessary comments; do not leave them "just in case." One-liner preferred.
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

Read `dev.log` at the repo root first, then `docker compose logs` for the backing service. UI-side regressions usually need a `bun run dev` tail plus browser console. Hedged discuss turns record three `AiCallRecord` rows grouped by `turnId`; grep the turnId for the full per-racer picture (`hedged`, `raceRole`, `ttftMs`).
When something breaks, an agent (or you) reconstructs the causal chain without copy-pasting logs:

1. **Read `dev.log` at repo root.** Grep for the project id or error string; read the matching `[umkm:scope] event {json}` lines in order. Every event carries a correlation id (`projectId` + `turnId` or request scope) so one id surfaces the full chain — e.g. a discuss turn: `discuss-turn:claim` → `[umkm:ai] discuss:start` → `discuss-turn:finalize`.
2. **Cross-reference infra with Docker logs** for 9Router / Headroom / Postgres failures: `bun run infra:logs` (or `docker compose logs -f`).
3. **Cross-reference raw AI payloads** in `.data/tmp/ai-debug/requests.ndjson` when a model call looks wrong (full request/response bodies that would bloat `dev.log`).
4. **Cross-reference per-request AI metadata** in the `AiCallRecord` table (query by `turnId`/`attemptId`/`projectId`) for latency, served model, tokens, and error class of every upstream call; raw payloads stay in `.data/tmp/ai-debug/requests.ndjson` (dev-only).
5. **Navigate before you grep.** Run `bun run graph:update` then read the source tree Graphify returns — non-trivial discovery goes through Graphify first, never blind search.

`dev.log` rotates at ~5 MB to `dev.log.1`; it is never deleted on crash (a crash is when it matters most). Both are gitignored.

## Admin settings (live product knobs)

Non-secret product config lives in `/admin/settings` (DB-first over `.env`). After save the server re-primes the settings snapshot so `getSettingSync` consumers pick up values without process restart. Approved users receive the configured one-time signup Energy grant (default 500,000); there is no automatic refill. Booster packs (`amount`, `compare_at_amount` list price for discount UI, `energy`) resolve via `getBoosterPack` / `GET /api/payment/packs` — change pricing in admin, not hardcoded UI. Secrets, OAuth, DB/S3 URLs, and topology stay env-only and still need an app restart when changed.

After deploying the one-time-grant migration, preview the existing approved-user reconciliation with `bun run energy:backfill`. Apply it once with `bun run energy:backfill --apply`; the partial unique index makes reruns idempotent. The backfill matches approved waitlist entries to users by normalized email, preserves completed-payment remainder, and reconciles other historical test credit into the 500,000 grant target.

## Moderation: banning a user unpublishes their sites

Banning a user (`/admin/users` → Blokir, sets `User.bannedAt`) also unpublishes
every one of their published sites: `p/<slug>` for a banned owner returns 410
Gone with `X-Robots-Tag: noindex` (deindex signal), and their running published
containers are stopped best-effort. The sitemap omits banned owners. Unbanning
restores everything — nothing is deleted, and sites come back online
automatically because the gate is a live read of `User.bannedAt`. The gate lives
in `src/routes/p.$slug.$.ts`.

## Attempt queue (BullMQ)

Two Redis-backed BullMQ queues (local Redis: compose `redis` on `127.0.0.1:6379`; override with `REDIS_URL`):

- **`project-attempt`** — generate, edit, and edit-build. Concurrency follows admin **Runtime — build concurrency** (default 3 in code; live after save).
- **`project-discuss`** — discuss turns only (default concurrency 5). Chat is not blocked by long generates.

Workers boot with the app process (`startAttemptQueueWorker`). On boot the worker also fire-and-forget pre-warms the shared golden `node_modules` under `.data/project-build-workspaces/_shared` so the first generate can skip install.

### Discuss progress stream

Discuss AI runs in the BullMQ worker and **persists regardless of the browser**. Live streaming uses a **shared progress bus** (local buffer + Redis pub/sub on `discuss-progress:{turnId}`, same `REDIS_URL` as BullMQ) so HTTP and worker can be different Node isolates.

The POST `/api/projects/preview` SSE tail also **polls `ProjectChatTurn`** until `succeeded`/`failed`/`cancelled` (or a hard ceiling). If Redis progress is dropped, the client still gets `finish`/`error` without a hard refresh. Logs: `discuss:sse-tail-db-fallback`, `discuss-progress:redis-publish-failed`.

Text-only fallback (no valid workspace card after one repair) still streams progressive text and emits protocol `tool-output-available` with `workspaceCard: { type: "none" }` — no invented questions/options. Expect **1** model call when the card is valid on primary, **2** when repair runs.

### Legacy discuss readiness gate

Legacy-v1 builds are authorized by a deterministic server gate (`src/lib/projects/discuss-readiness.ts`), not model confidence. When the AI emits a `build_recommendation`, the worker re-checks the brief against the structural blockers (primary offer, visitor job + CTA, local-vs-online, media strategy, visual direction). If any blocker is unresolved, the card is demoted to the next question. Only an explicit early-build request ("langsung bangun aja") passes with an honest warning naming what stays generic/omitted. Structural blockers are per `UmkmType` (`fnb`, `retail`, `jasa_lokal`, `jasa_online`, `kursus`, `other`); `targetCustomer`, `visuals`, and `stylePreference` are always structural. Logged as `discuss:gate`.

Generated apps bundle `public/placeholder.svg`; the generator guidance (`custom-source-generator.ts`) emits `<img src="/placeholder.svg">` only when an image slot is structurally necessary and no owner image exists — never a remote placeholder URL. Typographic layouts omit the slot instead.

## Environment

`.env.example` is the canonical placeholder list, grouped by concern (app, database, auth, AI, storage, email, payment, analytics, public sites) — read it directly rather than trusting a copy here; a stale duplicate of this block is exactly how past drift happened.

Model pricing uses a hybrid resolver. `config/model-pricing-overrides.json` is the Git-tracked manual source for 9Router/CMC naming mismatches and provider-only prices; OpenRouter `/api/v1/models` remains the automatic cache/refresh source for supported models. Every energy debit stores pricing proof (`rawModelId`, `pricedModelId`, `pricingSource`, prompt price, completion price) on `UserCredit`; user-facing UI intentionally hides provider/model names unless an admin/debug surface needs them.

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

Hedging is gated by `discuss.hedging` (feature_flag category, `DISCUSS_HEDGING_ENABLED`, default off). When on AND at least one hedge leg is set, the discuss turn runs primary + hedges in parallel; first card-valid stream wins, others are aborted. Hedged turns record per-racer `AiCallRecord` rows (`hedged: true`, `raceRole: winner|aborted`) grouped by `turnId`; the `UserCredit` debit is the sum of all racers (1:1 transparency). Best-effort partial tool-args streaming (`nextAssistantTextDeltaFromPartialToolJson`, winner's stream only) is gated by `discuss.partial_tool_streaming` (`DISCUSS_PARTIAL_TOOL_STREAMING`, default `true`). Deploy-time schema compat gate: `bun scripts/verify-hedge-schemas.ts` — hard-fails if any configured combo rejects the card tool schema (the 422 class).

Empty task value → default → hardcode `default-combo`. Admin dropdown loads `GET /api/admin/ai-models` → 9Router `GET {NINE_ROUTER_BASE_URL}/models` filtered to `owned_by: "combo"` (not upstream provider models). Create combos in 9Router dashboard with these ids: `default-combo`, `moderation-combo`, `discuss-combo`, `build-combo`.

`STORAGE_PROVIDER` is not user-configurable: local dev always speaks S3 to the MinIO container `bun run infra` starts, and production points the same `S3_*` variables at Cloudflare R2. Set Google OAuth, Turnstile, Chromatic, and AI provider secrets only in `.env` or deployment secrets. Error tracking (Sentry) was intentionally removed; there is currently no error-tracking provider wired.

Generated project runtime artifacts are local by default. `.data/` is ignored by Git; keep canonical `.data/project-artifacts` mounted/persistent for review sessions that must survive restart. Home project thumbnails are derived JPEGs under `.data/project-thumbnails`; keep that directory persistent when thumbnail continuity matters, or let missing images fall back to the deterministic gradient until the next successful build or first preview recovery. Capture runs in an isolated Node subprocess with a hidden browser window; local Windows uses installed Chrome when `PROJECT_THUMBNAIL_BROWSER_PATH` is empty. Set that path only to override browser discovery. Runtime/build workspaces are rebuildable. Local/test generated execution stays enabled by default; production Compose explicitly disables build and public execution until the isolated-worker and separate-origin gates pass.

## Contract-compiled generation (staged, off)

`contract-v1` is a staged generation engine (see `docs/superpowers/specs/2026-08-03-contract-compiled-generation-design.md`). Two admin settings control it, both DB-first:

- `generation.contract_compiled_rollout` (`off | internal | pilot | all`, default `off`) — assignment at project creation only. Sticky on `Project.generationEngine`.
- `generation.contract_admission` (`paused | enabled`, default `paused`) — execution admission. No contract attempt is enqueued until an operator flips it to `enabled`. This is the emergency rollback knob: flipping to `paused` stops new contract attempts immediately without changing sticky engines or selected deployments.

Contract-v1 discussion prepares an immutable contract/plan handoff before the build card; generation compiles protected topology and enforces an AI write allow-list, claim grammar, and browser gates. Legacy-v1 remains the default and is unaffected.

Idle runtime cleanup:

```bash
bun run runtime:idle-stop
```

Use this from cron/systemd/timer-equivalent in a single-node deployment until a dedicated worker owns the loop.

Preview runtime self-heals: a deleted/removed serving docroot surfaces as a 404
on the health probe, which marks the deployment stopped and re-materializes the
S3 dist on the next page load. The owner can also restart a preview explicitly
via `POST /api/projects/:id/restart` (owner-only). Full AI rebuilds remain the
separate `POST /api/projects/:id/generate` path.

Generated previews/published sites inject a capture-phase error listener that
swaps a failing `<img>` to an aspect-aware placeholder data-URI (landscape vs
portrait), so broken images never show a browser error icon and work even for
old builds whose dist lacks a placeholder file.

## Batched generation (Phase 1, off by default)

The batched engine replaces the agent tool-loop with a single streamed response that emits all project files as parseable blocks. Spec: `docs/superpowers/specs/2026-08-04-batched-generation-design.md`.

- **Rollout flag:** `generation.batched_rollout` (`off | internal | pilot | all`, default `off`). `off` runs today's path. `internal` gates on admin owner email; `pilot` buckets ~10% of projects deterministically (FNV-1a hash); `all` rolls everyone in.
- **Response contract:** `src/lib/projects/batched-response.ts` — strict state machine over `<file path>…</file>`, `<propose>`, `<done summary/>`. Unknown tags / missing attrs / disallowed paths / truncation throw `BatchedParseError` with byte offsets so repair prompts can cite them.
- **Fallback:** any irrecoverable batched failure (final parse error, failed validation after 2 targeted repairs, transport error) escalates to `generateCustomProjectFilesWithAgent` within the same attempt. No user-visible breakage.
- **Telemetry:** per-call `AiCallRecord` rows use `phase: "writer" | "format-repair" | "repair" | "fallback"`, always under `task: "build-step"` (writer) / `"build-repair"` (repair rounds). Query by `attemptId` for the full picture.
- **Prompt inputs:** the system prompt derives its scaffold manifest from `src/lib/projects/scaffold/manifest.ts` (auto-extracted from `createViteTanStackShadcnStarterFiles`). Scaffold changes break the companion drift test until consciously updated — no silent prompt drift.

### Batched edit (Phase 2)

Edits ride the SAME `generation.batched_rollout` flag — no separate toggle. `src/lib/projects/batched-edit.ts` picks target files deterministically from the instruction (path-stem noun tokens with stop-token filter and an 8-file ambiguity cap), runs ONE streamed response with the same parser + gates as Phase 1, repairs up to 2 rounds on the implicated paths, and returns `needsFallback` when the budget is spent — the worker then runs `editGeneratedSourceWithAgent` unchanged. Per-call ledger rows carry `task: "edit"` and `phase: "writer" | "format-repair" | "repair" | "fallback"` under the same `attemptId`, so the additive fallback billing mirrors Phase 1. Per-file write-through keeps flowing to the existing ProgressiveSaver hook while a batched edit streams, so refresh safety matches the legacy loop.

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

CI runs Storybook build/tests, optional Chromatic, `bun run build`, `bun run verify`, then `bun run test:integration` against a real database.

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
