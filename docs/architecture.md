# Architecture

Canonical architecture notes for UMKM Cepat. Code is the source of implementation truth; this file records constraints and decisions that should not drift.

## Product model

UMKM Cepat is one AI builder platform for many user projects.

```text
One Next.js control-plane platform app
One PostgreSQL metadata database
Many Project rows
Many source snapshots, builds, deployments, and runtime events
One legacy shared renderer/preview fallback
Many generated artifacts and supervised runtime deployments
```

UMKM Cepat remains one platform/control-plane app. Generated project runtimes may run out-of-process as isolated deployments, but only through the source snapshot, build, deployment, runtime node, runtime supervisor, and proxy architecture documented in `docs/architecture.md`.

Platform Constraints:

- 100% free for users. An optional paid Energy Booster (non-expiring extra energy) is available, but it only adds energy — it never gates features, so the platform stays fully free.
- Pilot whitelist with admin approval restricts registration and limits scale (initially targeting ~10 active UMKM businesses).
- User quotas refills are enabled via an Energy Booster modal (1-column layout) integrated into the navbar profile dropdown.

Rules:

- Do not create per-user platform apps.
- Do not dynamically import generated source into the Next.js control plane.
- Do not evaluate generated JavaScript in the platform runtime.
- Per-project runtime containers are allowed only as supervised isolated deployments.
- The production web app must not own the Docker socket; container control belongs behind a runtime supervisor service/interface.
- Runtime deployments should support scale-to-zero: idle deployments stop, and later traffic can cold-start them.
- Source snapshots, build attempts, deployments, runtime nodes, and runtime events are first-class concepts, not fields to collapse back into `Project`.
- The existing schema renderer and DB-served static preview are legacy/fallback infrastructure, not the final generated runtime engine.

## Project workspace

Current flow:

```text
prompt -> guided AI discussion -> confidence-gated brief -> AI-decided implementation spec -> generated frontend source/build -> artifact-backed preview runtime -> optional public publish
```

Core rules:

- AI clarifies before building when ambiguity changes output quality.
- Build readiness is confidence-driven, not a fixed field checklist. The AI records a 0-100 confidence score and unresolved open questions on the project brief. A normal build recommendation requires at least 95% confidence and no open questions; users may still explicitly force a build, which records the assumptions used.
- Project brief memory is canonicalized as flexible `facts[]` and `decisions[]`. Legacy fields such as `businessName`, `businessType`, `offer`, `targetCustomer`, `contactOrCta`, and `stylePreference` remain compatibility caches for build prompts and older project data, not the product schema or readiness gate.
- Discussion turns run server-side with a DB-backed `ProjectChatTurn` lease. The POST handler persists the user message first, claims the turn lease (one turn at a time per project), fires a detached `runDiscussTurn` worker that runs the AI calls, and returns a tail stream that replays the worker's pub/sub progress events. The stream is a tail, not the generation itself: leaving mid-turn never loses the reply and never wedges the composer. The client auto-resumes on reconnect by re-claiming the lease; if the channel is gone (server restart), the tail falls back to DB-state replay of the persisted assistant reply. The lease survives restart; reconnect-after-restart falls to DB-state replay. Energy is charged for the full turn even on disconnect. The in-process discuss lock (in-memory `Set` + TTL timer) is removed; the DB lease is the single source of truth.
- Discussion turns use one visible streaming AI call for chat text, followed by a hidden schema-validated call for structured workspace UI (now inside the detached worker). The hidden card stage has its own short timeout, bounded semantic repair, and an outer server deadline; the visible reply is never regenerated just to repair its card. The route duration must cover the normal discussion timeout plus this bounded repair window.
- Structured workspace cards remain authoritative. Card generation gets bounded transport retries plus one bounded semantic repair attempt. If it still fails, the server preserves the real assistant reply, records an explicit missing-card state, and the client offers a manual card-only retry without replaying the user answer or generating a second visible reply. Chat text must never be parsed or converted into an inferred card. Once a question is answered, that card is stale and must be hidden immediately.
- When a workspace card becomes a build recommendation, the client treats it as the primary composer decision instead of a chat-history message. The normal text composer stays hidden until the user explicitly continues discussion.
- If the user continues discussion after a build recommendation, the client keeps a local hold keyed by that recommendation content. Refreshes preserve the discussion composer for the same recommendation, while changed recommendation content surfaces the build decision again.
- After a generated build completes, the build recommendation is no longer shown as the primary composer. The client shows a review state with preview, chat-edit, and rebuild actions. The normal text composer only returns when the user chooses to keep editing through chat.
- Build generation streams server-sent progress events to the workspace; the client must render those events as visible build steps instead of hiding progress behind a generic spinner.
- Build generation asks AI for a schema-validated flexible implementation spec before writing source. The spec lets AI choose landing, marketing site, or interactive full-stack app shape, including pages, components, features, content, and visual direction. A landing page is one valid outcome, not the forced default. Invalid or incomplete specs receive one bounded semantic retry, then fail the build honestly before source generation; deterministic compatibility specs must never replace a failed AI result. New project rows do not pre-populate generic site content. Legacy site schema remains compatibility data for existing records only; it must never be presented as successful AI-generated final source.
- Opening a project or creating the first project draft must not trigger a separate AI card-generation call.
- Project creation requests may carry an idempotency key scoped to the authenticated user and create action. Retries and double submits for the same draft should return the original project instead of creating duplicates.
- User projects start as data and artifacts. Projects that need live runtime behavior should become isolated deployments managed outside the web app process.
- Generated source/build artifacts may exist for preview, inspection, repair, export, and future publishing.
- Generated source edits go through the constrained server-owned agent tool runner. Browser requests carry user instructions and annotations, never privileged file-tool commands. The runner exposes structured read, list, search, write, replace, and check operations to the server-owned agent, enforces project file boundaries, blocks platform-owned executable files, records side effects, emits operation trace events for the workspace timeline, and blocks success when app checks are missing or policy checks fail.
- Generated build execution is disabled by default in production until the isolated worker gate is proven. Local/test execution still validates exact build scripts, rejects non-platform Vite/build configuration, disables dependency lifecycle scripts, and cannot be treated as the final tenant isolation boundary.
- Visual/comment-driven edits create a durable `ProjectEditAttempt` before AI work starts. Attempts store the user-facing summary, hidden annotation payload, validation/advisory issues, lease token/timestamps, and final status so failed or rejected edits remain auditable and user comments are not lost. Project claims use an expiring fencing token; only the current token may promote output or clear the claim. Stale recovery can release an expired operation even when no `ProjectBuild` row was created. Validation blocks only clear non-rendered/no-change edits; heuristic target/selector concerns are advisory and may trigger one repair pass instead of silently discarding the request.
- The platform must not execute arbitrary user backend code.
- One bad project must not break the platform or another project.

Runtime foundation flow:

```text
Project -> ProjectSnapshot -> ProjectBuild -> ProjectDeployment -> RuntimeNode
```

The legacy build/preview fields remain as compatibility fallback data. The generation route now creates a `ProjectSnapshot`, queues/runs a `ProjectBuild`, writes local artifact refs for generated source and dist output, creates a preview `ProjectDeployment`, and records runtime events. The private preview route prefers the deployment proxy and only falls back to legacy `Project.distFiles` when no artifact-backed deployment exists.

Deleting a project must delete every resource tied to it, not just the DB row: stop running `ProjectDeployment` runtimes, delete source/dist artifacts (local dir or R2 objects), remove materialized runtime dirs and build workspace dirs, delete owner-uploaded project assets, and delete the project thumbnail. `src/lib/projects/project-cleanup.ts` runs this best-effort before the DB delete so refs stay queryable; the Prisma schema cascades the remaining metadata rows (`ProjectSnapshot`, `ProjectBuild`, `ProjectDeployment`, `ProjectEditAttempt`, `ProjectIdempotencyKey`, `ProjectAsset`). A failed resource step is recorded and never blocks the next step, but the call must not silently leave orphaned files or R2 objects.

### Snapshot history and restore

`ProjectSnapshot` rows form an append-only version graph via `parentSnapshotId`; every generate and every edit attempt creates one. `src/lib/projects/snapshots.ts` is the read/list/restore authority. Restore is **branching, not destructive**: `restoreSnapshot` creates a NEW `ProjectSnapshot` whose parent points at the target, copying its `files` + `sourceRef` — the target and all newer snapshots remain. Snapshots whose `files` JSON and `sourceRef` artifact are both absent (cleaned up) are list-only and not restorable. The workspace surfaces the graph through `GET /api/projects/$id/snapshots` (list, newest-first, with build status + restorability), `GET /api/projects/$id/snapshots/$snapshotId/source?path=` (read one file from a past snapshot), and `POST /api/projects/$id/snapshots/$snapshotId/restore` (branch). All owner-scoped.

## Renderer and preview

- Validate AI output before saving or rendering.
- Check ownership on every private project route.
- Serve private preview artifacts with `noindex`.
- Private preview responses must send sandbox-safe CORS headers because generated sites render inside an iframe without same-origin privileges. Both runtime proxy responses and legacy DB artifact responses set `Access-Control-Allow-Origin: *` and `Cross-Origin-Resource-Policy: cross-origin`.
- Private preview HTML must rewrite generated asset URLs to signed asset routes. Sandboxed iframes have a `null` origin and do not rely on the user's auth cookie for module script and CSS requests.
- Preview failures are first-class UI states. Runtime startup failure, build failure, and known runtime load errors must show an actionable preview panel instead of leaving a blank white iframe.
- Generated frontend apps send a `umkmcepat-preview-ready` postMessage after React renders. The workspace keeps its loading state while the ready signal is absent and performs bounded silent recovery for cold starts (a fixed retry budget, not an infinite loop); it must not ask users to reload a preview that can still start itself. When the budget is exhausted without the ready signal — e.g. the runtime supervisor is `noop` in production so the preview route returns an error page, or the generated app never calls `usePreviewReady()` — the loader escalates to an actionable error panel with a manual retry instead of spinning forever. Only a terminal build failure without a successful artifact becomes an actionable error state.
- Do not dynamically import generated/user files into the Next.js app.
- Do not evaluate user JavaScript in the platform runtime.
- Keep public publishing artifact-backed and cacheable when possible.
- Authenticated home project cards use one derived JPEG thumbnail per project, never a live generated-site iframe. A bounded headless-browser capture runs only after successful build commit, atomically replaces the prior project image, and cannot change build success. Missing or failed images use the deterministic project gradient; the interactive workspace keeps the live artifact-backed iframe.

Legacy public links retain the `/p/[slug]/[[...path]]` shape, but generated JavaScript must not be served from the authenticated control-plane origin. Production public execution remains disabled until `GENERATED_PUBLIC_ORIGIN` points to a verified cookie-free HTTPS origin that differs from the control plane. Control-plane `/p` requests may redirect to that origin; only requests arriving on the configured generated host may resolve generated bytes.

Public routes and future custom domains should resolve through the generated-origin proxy/static plane to committed artifacts or supervised runtime deployments. They should not create separate control-plane apps or receive control-plane session cookies.

## Runtime foundation

The isolated generated project runtime is now the active architecture direction. The first working adapter is a local-process static runtime for generated Vite artifacts. It keeps generated code out of the Next.js module graph, but it is still a single-node adapter, not the final Docker/container supervisor shape.

Planes:

```text
Control Plane  = Next app, auth, workspace, metadata
Build Plane    = async builders turn snapshots into artifacts/images
Runtime Plane  = supervisor starts/stops isolated deployments
Proxy Plane    = preview/public traffic routes to active deployments
Storage Plane  = Postgres metadata + object storage artifacts
```

The control plane owns project metadata and user workflows. Build workers and runtime supervisors should be separate services or clearly separated internal modules before they get access to container runtimes. The web app may request a deployment start/stop through a `RuntimeSupervisor` interface, but production Docker socket access must stay outside the Next app container.

Current runtime implementation:

- `PROJECT_ARTIFACT_STORAGE_PROVIDER` chooses canonical generated source/dist artifact storage: `local` by default, or `r2` for Cloudflare R2. New writes use the configured provider; reads use the provider embedded in each artifact ref, so existing `project-artifact:local:*` refs remain readable after switching.
- `PROJECT_ARTIFACT_DIR` stores local source/dist artifacts under `.data/project-artifacts` by default when the artifact provider is `local`.
- `PROJECT_ARTIFACT_R2_PREFIX` scopes generated source/dist artifact keys inside the R2 bucket when the artifact provider is `r2`.
- `PROJECT_RUNTIME_DIR` stores materialized runtime files under `.data/project-runtimes` by default.
- `PROJECT_BUILD_WORKSPACE_DIR` stores rebuildable local build workspaces under `.data/project-build-workspaces` by default. Build workspaces cache generated app `node_modules` and build metadata so repeat edits can skip dependency install when the package/profile signature is unchanged. Source snapshots and dist artifacts remain canonical; workspaces may be deleted and rebuilt.
- `RuntimeSupervisor` starts a local out-of-process static server from a dist artifact and records deployment events.
- Private preview traffic goes through `/api/projects/[id]/preview/[[...path]]`, cold-starting stopped preview deployments when needed.
- Published traffic is permitted only on the configured generated-site origin. Legacy control-plane `/p/[slug]/[[...path]]` links redirect there after the origin is configured; same-origin generated serving is disabled in production.
- Proxy traffic must re-check a `running` deployment before forwarding. If the process is gone or stale, the same request should start it again instead of requiring a second refresh.
- Promoting a successful preview deployment stops older `starting`/`running` preview deployments for the same project best-effort. Historical deployment rows stay auditable, but superseded local processes must not consume runtime capacity indefinitely.
- `bun run runtime:idle-stop` is the scale-to-zero worker entry for stopping idle preview deployments.
- `PROJECT_RUNTIME_SUPERVISOR=noop` disables runtime starts for test/safe environments.

Current first-class runtime records:

- `ProjectSnapshot`: source snapshot for generated/imported/manual project source.
- `ProjectBuild`: build attempt for a snapshot.
- `ProjectDeployment`: preview or published deployment attached to a build/snapshot.
- `RuntimeNode`: capacity location for future supervised runtimes.
- `RuntimeEvent`: append-only lifecycle event log.

The legacy `Project.sourceFiles` and `Project.distFiles` fields remain transitional compatibility storage. New runtime work should prefer artifact refs on `ProjectSnapshot.sourceRef` and `ProjectBuild.artifactRef`, plus first-class deployment/event records.

## Full-stack direction

UMKM Cepat can feel full-stack through platform-owned modules first:

```text
Form
Catalog
Booking
Order
Lead CRM
Table
WhatsApp CTA
Email notification
File upload
Payment link
```

AI may configure these modules. The platform executes them. Arbitrary user backend code is not part of the MVP.

## Generated project stack (locked)

The generated Vite app is a locked, platform-owned stack. Do not swap frameworks, add a CSS framework, or introduce a CLI-driven component pipeline without changing this section first.

Stack:

- **Vite + React 19 + TypeScript** as the build/runtime base.
- **TanStack Router** with `createHashHistory()` (static, sandboxed-iframe-safe). Multi-page is a valid outcome, not a forced default — when the brief has distinct sections, the agent writes one route file per page under `src/routes/` (e.g. `katalog.tsx`, `kontak.tsx`) and registers it in `src/router.tsx` via `createRoute({ getParentRoute: () => rootRoute, path, component })` + `rootRoute.addChildren([...])`, then navigates with `<Link to="...">` from `@tanstack/react-router`. A landing page is still a valid single-page outcome.
- **Tailwind CSS v4** via `@tailwindcss/vite`, CSS-first config (`@import "tailwindcss";` + `@theme inline` + `:root` in `src/index.css`). No `tailwind.config.js`. All styling is Tailwind utility classes inline in TSX; no custom CSS class names (no `.btn-primary`/`.hero-section`). Full-height sections use `min-h-dvh`, never `h-screen`.
- **shadcn/ui "new-york"** components, source-copied verbatim from the canonical shadcn registry into `src/components/ui/*` at scaffold time (button, card, badge, input, label, separator). No shadcn CLI runs at build time. The AI writes any extra shadcn primitives directly into `src/components/ui/<name>.tsx` following the canonical new-york + Tailwind v4 shape (`import { cn } from "@/lib/utils"`, Radix primitives, Tailwind utilities + theme vars).
- **motion (framer-motion)** via `import { motion } from "motion/react"` is the supported scroll/entrance-animation library. It is scaffold-declared in the generated `package.json` (allowlisted in the generated package policy) so Vite resolves a single app-local copy with the app's own React. The AI must never emit a package import that is not declared in the generated `package.json` — the build-policy gate rejects undeclared imports because Vite would otherwise hoist the dependency from the platform's own `node_modules`, bundling a second React copy (framer-motion's internal React ≠ the app's React) and crashing the generated app at runtime with `Cannot read properties of null (reading 'useContext')` before `usePreviewReady()` can fire, leaving the preview iframe spinning forever.

Agent tool runner:

- The constrained server-owned agent tool runner exposes only file operations: `check_app`, `list_files`, `read_file`, `search_files`, `write_file`, `replace_in_file`, `read_skill`. There is no shell access. The runner enforces project file boundaries, blocks platform-owned executable files, records side effects, emits operation trace events, and blocks success when app/policy checks fail.
- Platform-owned files the agent must not edit: `package.json`, `vite.config.ts`, `tsconfig.app.json`, `tsconfig.node.json`, `components.json`, `src/main.tsx`, `src/router.tsx` (beyond adding routes), `src/routes/__root.tsx` (beyond a shared layout), `src/routes/not-found.tsx`, `src/lib/utils.ts`, `src/index.css`, `src/content/site.ts`. Business data lives in `src/content/site.ts` as TS objects, not a database.

Build workspace caching:

- Build workspaces are keyed by the real project id via a stable `workspaceKey` option (defaults to the generated app manifest's `projectId`). Repeat builds with an unchanged dependency signature skip `bun install` by reusing `node_modules` and the `.cache/generated-app/build-cache.json` metadata in the workspace. Source snapshots and `dist` artifacts remain canonical; a workspace may be deleted and rebuilt.
- `PROJECT_BUILD_WORKSPACE_DIR` stores rebuildable local build workspaces under `.data/project-build-workspaces` by default.

Styling and theme:

- Theme tokens come from the brief (`schema.theme`: `background`, `foreground`, `muted`, `accent`) and are mapped to shadcn CSS vars in `src/index.css` (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--destructive-foreground`, `--border`, `--input`, `--ring`, `--radius`, plus the `--color-*` Tailwind v4 `@theme inline` mapping). The agent consumes these via Tailwind utilities (`bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `bg-muted`, `text-muted-foreground`, `bg-accent`, `text-accent-foreground`, `border-border`, `ring-ring`). `src/index.css` and `src/content/site.ts` are read-only to the agent.

Verify-before-ship gate:

- `checkAgentSourceQuality` runs after the agent's source writes. If the starter placeholder marker (`// Replace this with the real home page built from the brief`) is still present in `src/routes/index.tsx`, the gate fails the build and triggers one bounded forced-rewrite pass (evaluator-optimizer pattern) before falling back to last-resort stub injection. The gate also requires at least one edited presentation or content file, route files under `src/routes/`, content files under `src/content/`, and the `usePreviewReady()` signal actually called from a rendered route.

Static-frontend constraint:

- Generated apps are static-frontend-only. Backend, database, auth, payments, checkout, fake persistence, browser automation, and native dependencies are future work, not present scope. `localStorage` may hold only ephemeral drafts, never durable business data.

## Provider boundaries

Provider selection is explicit, env-driven, and behind internal adapters.

| Capability | Env                                   | Current default           | Boundary                     |
| ---------- | ------------------------------------- | ------------------------- | ---------------------------- |
| Database   | `DATABASE_URL`                        | PostgreSQL via Prisma     | `prisma/schema.prisma`       |
| AI         | `AI_PROVIDER`                         | 9Router via Vercel AI SDK | `src/lib/ai.ts`              |
| Auth       | Google OAuth + Turnstile              | Google                    | `src/lib/auth.ts`, Auth.js   |
| Rate limit | `RATE_LIMIT_PROVIDER`, `RATE_LIMIT_*` | `memory`                  | `src/lib/rate-limit.ts`      |
| Storage    | `OBJECT_STORAGE_PROVIDER`             | `local`                   | `src/lib/object-storage.ts`  |
| Runtime    | `PROJECT_RUNTIME_*`                   | local process supervisor  | `src/lib/projects/runtime-*` |
| Web search | `WEBSEARCH_PROVIDER`                  | `none` (disabled)         | `src/lib/websearch.ts`       |
| Monitoring | Sentry env                            | disabled unless env set   | Sentry config files          |

Rules:

- Business logic imports internal services, not vendor SDKs.
- Provider SDKs stay inside adapter modules.
- Missing optional provider config fails clearly.
- Runtime mocks are not used for real product behavior.
- Add providers only when the product needs them.

## Rate limits

The in-memory rate limiter is configurable through env so production can tune abuse protection without code changes.

Default limits:

```env
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

Logged-in AI and build requests use per-user buckets. Anonymous/fallback requests use per-IP buckets. Build limits are stricter than chat because generated project builds are more expensive.

## AI gateway

AI requests go through Vercel AI SDK and 9Router:

```text
UMKM Cepat UI -> UMKM Cepat API -> Vercel AI SDK -> 9Router -> provider -> model
```

### Agent web search tool

The source-generation agent may call a read-only `web_search` tool to gather public business/reference context. It is a **platform-side** tool (`src/lib/websearch.ts`) executed in the control plane and surfaced to the agent as sanitized text — never imported into generated source (the Phase-0 undeclared-import gate blocks that). It ships **disabled by default** (`WEBSEARCH_PROVIDER=none`); when `none`/unconfigured, `execute` returns a fail-closed "unavailable" string and never errors the build. Enabling points `FIRECRAWL_BASE_URL` at a **self-hosted** Firecrawl (no hosted/paid key is wired). Guardrails: SSRF/private-host block (loopback, RFC1918, link-local, cloud-metadata, malformed input), curated allowlist with deny-by-default + denylist override, HTML sanitize (strips script/style/iframe + remaining tags), per-result truncation, and devLog checkpoints. Results are plain text returned to the model; they are never written to files or executed.

Local AI/observability stack:

```bash
bun run infra
```

```text
9Router: http://localhost:20129
Headroom: http://localhost:8787/health
Default 9Router dashboard password: 123456
```

Use `bun run infra:minimal` only when you need Postgres without AI gateway or observability services.

Local env:

```env
AI_PROVIDER="9router"
AI_MODELS="cmc/deepseek/deepseek-v4-pro,cmc/deepseek/deepseek-v4-flash,cmc/moonshotai/Kimi-K2.6"
AI_CHAT_MODEL="cmc/deepseek/deepseek-v4-pro"
NINE_ROUTER_BASE_URL="http://localhost:20129/v1"
NINE_ROUTER_API_KEY=""
```

Production Compose can use Docker DNS:

```env
NINE_ROUTER_BASE_URL="http://9router:20128/v1"
```

Keep provider keys out of frontend env vars and git. `AI_CHAT_MODEL` should stay on a stronger structured-output-capable model because user-facing discussion consumes AI-generated JSON for both the visible assistant reply and the next workspace card. Fast/cheap models are acceptable for edit/moderation defaults, not mandatory brief progression.

## Storage

Current implemented storage provider:

```env
OBJECT_STORAGE_PROVIDER="local"
LOCAL_UPLOAD_DIR=".data/uploads"
```

`local` writes uploads under `LOCAL_UPLOAD_DIR`. For VPS/Docker, mount that path as a persistent volume.

### Owner-scoped project asset uploads

The platform stores owner-uploaded project assets (business images / references / logos used by the builder and the waitlist evidence flow) separately from generic uploads, under `PROJECT_ASSET_DIR` (default `.data/project-assets`). The `project-asset:local:<projectId>/<kind>/<ulid>.<ext>` ref encodes the on-disk path; `src/lib/projects/project-assets.ts` is the read/write/delete authority and validates content by magic bytes (PNG/JPEG/WEBP), not by client-supplied extension. A `ProjectAsset` row persists the ref for cleanup-on-delete; `project-cleanup.ts` deletes stored objects best-effort alongside the DB cascade. Uploads go through `POST /api/projects/$id/assets` (auth + owner + allowlisted `purpose` + size cap), and assets are served owner-scoped at `GET /api/projects/$id/asset/$assetId` behind auth. The `r2` provider path for these assets is intentionally not wired yet (local-only per the 2026-07-24 batch constraint); the local adapter is the only path exercised.

Reserved future provider:

```env
OBJECT_STORAGE_PROVIDER="r2"
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET=""
R2_PUBLIC_BASE_URL=""
```

`r2` env placeholders exist, but the adapter intentionally throws until remote object storage is actually needed. When R2 is implemented, runtime storage selection should come from `OBJECT_STORAGE_PROVIDER`; local upload volumes become optional for that deployment.

## Auth

Google OAuth is the login provider. Login is gated by the consent dialog and optional Cloudflare Turnstile.

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
TURNSTILE_SECRET_KEY=""
```

Leave both empty in local development to use the dev check. Set both in production if Turnstile should be enforced.

## Safety checklist

Before changing project, renderer, publishing, generated artifacts, providers, auth, storage, or AI behavior:

1. Does this preserve one platform app?
2. Is user/project data scoped by owner and project?
3. Is untrusted input validated before save/render/execute?
4. Does this avoid importing or evaluating generated code in the control-plane runtime?
5. If generated code needs a runtime, does it go through snapshots, builds, deployments, and a runtime supervisor boundary?
6. Does production keep Docker socket access out of the Next app?
7. Are provider details behind adapters?
8. Are secrets kept out of client env, logs, docs, and commits?
9. Is the solution still cheap on small VPS infrastructure and compatible with scale-to-zero?
