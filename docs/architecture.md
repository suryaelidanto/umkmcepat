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
prompt -> guided AI discussion -> structured brief -> generated frontend source/build -> artifact-backed preview runtime -> optional public publish
```

Core rules:

- AI clarifies before building when ambiguity changes output quality.
- Discussion turns use one streaming AI call: chat text streams as normal while structured workspace UI is returned through a schema-validated AI SDK tool call.
- Workspace cards are never parsed from chat text. If the tool output is missing or invalid, the server falls back to a deterministic valid card.
- Build generation streams server-sent progress events to the workspace; the client must render those events as visible build steps instead of hiding progress behind a generic spinner.
- Opening a project or creating the first project draft must not trigger a separate AI card-generation call.
- User projects start as data and artifacts. Projects that need live runtime behavior should become isolated deployments managed outside the web app process.
- Generated source/build artifacts may exist for preview, inspection, repair, export, and future publishing.
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
- Do not dynamically import generated/user files into the Next.js app.
- Do not evaluate user JavaScript in the platform runtime.
- Keep public publishing artifact-backed and cacheable when possible.

Public routes use the shared platform/proxy model:

```text
/p/[slug]
/p/[slug]/[[...path]]
```

Public routes and future custom domains should resolve through the proxy plane to either static artifacts or supervised runtime deployments. They should not create separate control-plane apps.

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

- `PROJECT_ARTIFACT_DIR` stores local source/dist artifacts under `.data/project-artifacts` by default.
- `PROJECT_RUNTIME_DIR` stores materialized runtime files under `.data/project-runtimes` by default.
- `RuntimeSupervisor` starts a local out-of-process static server from a dist artifact and records deployment events.
- Private preview traffic goes through `/api/projects/[id]/preview/[[...path]]`, cold-starting stopped preview deployments when needed.
- Published traffic goes through `/p/[slug]/[[...path]]`, cold-starting the published deployment when needed.
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

| Capability | Env                                   | Current default           | Boundary                     |
| ---------- | ------------------------------------- | ------------------------- | ---------------------------- |
| Database   | `DATABASE_URL`                        | PostgreSQL via Prisma     | `prisma/schema.prisma`       |
| AI         | `AI_PROVIDER`                         | 9Router via Vercel AI SDK | `src/lib/ai.ts`              |
| Auth       | Google OAuth + Turnstile              | Google                    | `src/lib/auth.ts`, Auth.js   |
| Rate limit | `RATE_LIMIT_PROVIDER`, `RATE_LIMIT_*` | `memory`                  | `src/lib/rate-limit.ts`      |
| Storage    | `OBJECT_STORAGE_PROVIDER`             | `local`                   | `src/lib/object-storage.ts`  |
| Runtime    | `PROJECT_RUNTIME_*`                   | local process supervisor  | `src/lib/projects/runtime-*` |
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

Local AI gateway:

```bash
bun run infra:ai
```

```text
9Router: http://localhost:20129
Headroom: http://localhost:8787/health
Default dashboard password: 123456
```

Local env:

```env
AI_PROVIDER="9router"
AI_MODELS="cmc/deepseek/deepseek-v4-pro,cmc/deepseek/deepseek-v4-flash,cmc/moonshotai/Kimi-K2.6"
NINE_ROUTER_BASE_URL="http://localhost:20129/v1"
NINE_ROUTER_API_KEY=""
```

Production Compose can use Docker DNS:

```env
NINE_ROUTER_BASE_URL="http://9router:20128/v1"
```

Keep provider keys out of frontend env vars and git.

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
