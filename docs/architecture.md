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

UMKM Cepat remains one platform/control-plane app. Generated project runtimes may run out-of-process as isolated deployments, but only through the source snapshot, build, deployment, runtime node, runtime supervisor, and proxy architecture documented in `docs/prds/isolated-project-runtime-prd.md`.

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
- Discussion turns normally use one streaming AI call: chat text streams as normal while structured workspace UI is returned through a schema-validated AI SDK tool call. Some OpenAI-compatible gateways can ignore a generic required-tool choice and return text-only with `finishReason: stop`; when that happens, the server runs one hidden named-tool repair call after the visible stream, preserving the streamed text while recovering the workspace card. The route duration must cover the normal discussion timeout plus this bounded repair window.
- Workspace cards are never parsed from chat text. A missing or failed tool output must never overwrite the last valid card with `none`; the client shows an explicit retry state if both the primary tool call and bounded repair fail.
- When a workspace card becomes a build recommendation, the client treats it as the primary composer decision instead of a chat-history message. The normal text composer stays hidden until the user explicitly continues discussion.
- If the user continues discussion after a build recommendation, the client keeps a local hold keyed by that recommendation content. Refreshes preserve the discussion composer for the same recommendation, while changed recommendation content surfaces the build decision again.
- After a generated build completes, the build recommendation is no longer shown as the primary composer. The client shows a review state with preview, chat-edit, and rebuild actions. The normal text composer only returns when the user chooses to keep editing through chat.
- Build generation streams server-sent progress events to the workspace; the client must render those events as visible build steps instead of hiding progress behind a generic spinner.
- Build generation asks AI for a flexible implementation spec before writing source. The spec lets AI choose landing, marketing site, or static interactive app shape, including pages, components, features, content, and visual direction. A landing page is one valid outcome, not the forced default. Legacy site schema remains a deterministic compatibility shape for starter metadata only; it must never be presented as successful AI-generated final source.
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

## Renderer and preview

- Validate AI output before saving or rendering.
- Check ownership on every private project route.
- Serve private preview artifacts with `noindex`.
- Private preview responses must send sandbox-safe CORS headers because generated sites render inside an iframe without same-origin privileges. Both runtime proxy responses and legacy DB artifact responses set `Access-Control-Allow-Origin: *` and `Cross-Origin-Resource-Policy: cross-origin`.
- Private preview HTML must rewrite generated asset URLs to signed asset routes. Sandboxed iframes have a `null` origin and do not rely on the user's auth cookie for module script and CSS requests.
- Preview failures are first-class UI states. Runtime startup failure, build failure, and known runtime load errors must show an actionable preview panel instead of leaving a blank white iframe.
- Generated frontend apps send a `umkmcepat-preview-ready` postMessage after React renders. The workspace iframe treats a missing ready signal as a script/runtime load issue and offers preview retry instead of leaving the canvas ambiguous.
- Do not dynamically import generated/user files into the Next.js app.
- Do not evaluate user JavaScript in the platform runtime.
- Keep public publishing artifact-backed and cacheable when possible.

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

## Provider boundaries

Provider selection is explicit, env-driven, and behind internal adapters.

| Capability       | Env                                   | Current default           | Boundary                              |
| ---------------- | ------------------------------------- | ------------------------- | ------------------------------------- |
| Database         | `DATABASE_URL`                        | PostgreSQL via Prisma     | `prisma/schema.prisma`                |
| AI               | `AI_PROVIDER`                         | 9Router via Vercel AI SDK | `src/lib/ai.ts`                       |
| Auth             | Google OAuth + Turnstile              | Google                    | `src/lib/auth.ts`, Auth.js            |
| Rate limit       | `RATE_LIMIT_PROVIDER`, `RATE_LIMIT_*` | `memory`                  | `src/lib/rate-limit.ts`               |
| Storage          | `OBJECT_STORAGE_PROVIDER`             | `local`                   | `src/lib/object-storage.ts`           |
| Runtime          | `PROJECT_RUNTIME_*`                   | local process supervisor  | `src/lib/projects/runtime-*`          |
| Monitoring       | Sentry env                            | disabled unless env set   | Sentry config files                   |
| AI observability | `LANGFUSE_*` env                      | disabled unless env set   | `instrumentation.ts`, `src/lib/ai.ts` |

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

Local AI/observability stack:

```bash
bun run infra
```

```text
9Router: http://localhost:20129
Headroom: http://localhost:8787/health
Langfuse: http://localhost:3001
MinIO console: http://localhost:9091
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

Langfuse is the optional AI observability backend. When `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_SECRET_KEY` are set, Next.js initializes OpenTelemetry at startup and AI SDK calls emit traces for moderation, guided discussion, implementation-spec generation, chat compaction, source generation, and source edits. Trace metadata must include route/function/project context where available, but must not include raw provider secrets.

To get cost calculations for non-openai names from 9Router (for example `cmc/deepseek/deepseek-v4-pro`), seed matching model definitions in Langfuse once per environment:

```bash
bun run langfuse:seed-models
```

This script adds model catalog entries for configured `AI_MODELS` names that have pricing definitions.

## Storage

Current implemented storage provider:

```env
OBJECT_STORAGE_PROVIDER="local"
LOCAL_UPLOAD_DIR=".data/uploads"
```

`local` writes uploads under `LOCAL_UPLOAD_DIR`. For VPS/Docker, mount that path as a persistent volume.

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
