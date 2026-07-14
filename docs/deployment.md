# Deployment

Runtime, Docker, storage, and monitoring notes for UMKM Cepat.

## Local development

Run Next.js locally and infrastructure in Docker:

```bash
bun install
cp .env.example .env
bun run infra
bun run db:migrate
bun run dev
```

```text
App: http://localhost:3000
9Router: http://localhost:20129
Langfuse: http://localhost:3001
MinIO console: http://localhost:9091
```

`bun run infra` starts Postgres plus the local AI/observability stack: 9Router, Headroom, Langfuse, and Langfuse dependencies. Use `bun run infra:minimal` only when you need Postgres without AI/observability. Use `bun run infra:down` to stop every container attached to the project's Compose network and remove that network; named data volumes remain intact for the next startup.

Set `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_SECRET_KEY` in `.env`. Local `.env.example` uses the same deterministic project key for Langfuse bootstrap and app tracing so observability works after first startup; replace both keys before any shared environment. After changing tracing keys, restart `bun run dev`. Local ClickHouse loads `infra/langfuse-clickhouse-settings.xml`; it disables a ClickHouse 26.x lazy-materialization planner bug that breaks Langfuse trace joins, while preserving trace data.

Langfuse local Compose disables public signup (`AUTH_DISABLE_SIGNUP=true`); use the bootstrap admin account only. In production, keep Langfuse behind Cloudflare Access/reverse-proxy auth and never expose its backing Postgres, ClickHouse, Redis, or MinIO services.

After Langfuse boots and API keys are in `.env`, seed model pricing IDs used by 9Router:

```bash
bun run langfuse:seed-models
```

Run this whenever you change `AI_MODELS` or deploy to a fresh Langfuse database so traces can map usage to cost tiers.

Use local Node/Bun for the Next.js dev server because bind-mounted Docker dev can make `.next` and file watching stale on some host filesystems.

If `.next` gets stale, stop the dev server, remove `.next`, then restart `bun run dev`.

## Production Compose

Build and start production services:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Production Compose runs:

```text
migrate job:        one-shot Prisma migration release step
app container:      Next.js production server after migration succeeds
postgres container: database, unless using managed Postgres
9router container:  AI gateway dashboard/API
headroom container: optional context compression proxy
langfuse stack:     optional AI trace storage/UI (web, worker, Postgres, ClickHouse, Redis, MinIO)
uploads volume:     local upload persistence for OBJECT_STORAGE_PROVIDER=local
project_artifacts:  canonical generated source/dist persistence for local artifact storage
```

Current production Compose does not yet include the verified isolated generated-project build worker, runtime supervisor, proxy plane, or per-project runtime containers. Therefore generated build execution and public generated JavaScript execution default to disabled in production. Existing project metadata, snapshots, artifacts, and last-good preview records remain intact while those capabilities are disabled.

The app exposes two uncached operational probes: `/api/health/live` confirms the process can answer, while `/api/health/ready` performs a bounded critical database check. Production Compose routes its app healthcheck through readiness. AI observability is optional and does not fail readiness; generated capabilities remain governed by their explicit containment switches.

Public-facing services bind to localhost:

```text
app:     127.0.0.1:3000
9Router: 127.0.0.1:20129
```

Put Cloudflare Tunnel, Cloudflare Access, Nginx, Caddy, or another reverse proxy in front. Do not expose Postgres, Docker socket access, runtime supervisor internals, or Headroom publicly.

Preferred ingress:

```text
umkmcepat.com          -> reverse proxy/tunnel -> http://localhost:3000
www.umkmcepat.com      -> reverse proxy/tunnel -> http://localhost:3000
generated.example.net  -> generated proxy      -> generated-origin app/proxy listener
9router.umkmcepat.com  -> protected access     -> http://localhost:20129
```

Production Compose runs `bunx prisma migrate deploy` as the one-shot `migrate` service. The app starts only after that service completes successfully. The app image itself starts only `bun run start`; migrations are not repeated inside every application process. Node instrumentation then runs a fail-closed production preflight: public/auth URLs must be HTTPS and aligned, the auth secret must be strong, OTP delivery must be configured, default PostgreSQL credentials are rejected, canonical artifact storage must pass readiness, unsafe local runtime authority must remain `noop`, and generated execution capabilities remain disabled until their external gates pass.

## Minimum production env

```env
NEXT_PUBLIC_APP_URL="https://umkmcepat.com"
NEXTAUTH_URL="https://umkmcepat.com"
NEXTAUTH_SECRET="replace-with-strong-secret"
GOOGLE_CLIENT_ID="replace"
GOOGLE_CLIENT_SECRET="replace"
OTP_SPACE_API_KEY="replace-with-otp-space-api-key"
AI_PROVIDER="9router"
NINE_ROUTER_BASE_URL="http://9router:20128/v1"
NINE_ROUTER_API_KEY="replace-with-9router-api-key"
LANGFUSE_BASE_URL="https://langfuse.example.com"
LANGFUSE_PUBLIC_KEY="replace-with-langfuse-public-key"
LANGFUSE_SECRET_KEY="replace-with-langfuse-secret-key"
RATE_LIMIT_PROVIDER="memory"
OBJECT_STORAGE_PROVIDER="local"
LOCAL_UPLOAD_DIR=".data/uploads"
GENERATED_BUILD_EXECUTION_ENABLED="false"
GENERATED_PUBLIC_EXECUTION_ENABLED="false"
GENERATED_PUBLIC_ORIGIN="https://generated.example.net"
PROJECT_ARTIFACT_STORAGE_PROVIDER="local"
PROJECT_ARTIFACT_DIR="/app/.data/project-artifacts"
PROJECT_THUMBNAIL_DIR="/app/.data/project-thumbnails"
PROJECT_THUMBNAIL_CAPTURE_ENABLED="true"
PROJECT_THUMBNAIL_BROWSER_PATH=""
PROJECT_ARTIFACT_R2_PREFIX="project-artifacts"
PROJECT_RUNTIME_DIR="/app/.data/project-runtimes"
PROJECT_BUILD_WORKSPACE_DIR="/app/.data/project-build-workspaces"
PROJECT_RUNTIME_SUPERVISOR="noop"
PROJECT_RUNTIME_MAX_CONTAINERS="8"
PROJECT_RUNTIME_HEALTH_TIMEOUT_MS="2000"
PROJECT_RUNTIME_PROXY_TIMEOUT_MS="15000"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="replace-with-strong-db-password"
POSTGRES_DB="umkmcepat"
```

Project-card thumbnails are derived JPEGs stored under `PROJECT_THUMBNAIL_DIR`. The production image installs Chromium plus Node, fixes `PROJECT_THUMBNAIL_BROWSER_PATH`, enables capture, and persists the `project_thumbnails` volume. Capture runs in a disposable Node subprocess so a renderer timeout kills only that process tree, not the application. Development and production therefore use the same successful-build capture lifecycle. Missing thumbnails safely use the deterministic project gradient; opening a private preview makes one best-effort recovery attempt only when the latest successful build has no thumbnail. Capture failures never invalidate successful build artifacts.

If `OBJECT_STORAGE_PROVIDER="local"`, mount `LOCAL_UPLOAD_DIR` as a persistent volume. Generated project source/dist artifacts are controlled separately by `PROJECT_ARTIFACT_STORAGE_PROVIDER`. Production Compose deliberately fixes `PROJECT_ARTIFACT_DIR` to `/app/.data/project-artifacts` and mounts `project_artifacts` there; the production preflight rejects another local path rather than silently writing canonical artifacts to the ephemeral container layer. Node startup performs a write/read/delete readiness probe and refuses to serve if local canonical storage is unavailable. With `r2`, startup validates the required R2 configuration and generated artifact writes use `PROJECT_ARTIFACT_R2_PREFIX`; existing local refs remain readable because artifact refs include their provider. `PROJECT_RUNTIME_DIR` and `PROJECT_BUILD_WORKSPACE_DIR` are rebuildable. A future isolated worker may own a trusted toolchain cache, but generated executable state must not persist across tenants.

`GENERATED_BUILD_EXECUTION_ENABLED` and `GENERATED_PUBLIC_EXECUTION_ENABLED` are containment switches. Production Compose hardcodes both to `false` and `PROJECT_RUNTIME_SUPERVISOR` to `noop`; values copied from the development `.env.example` cannot override those boundaries. Do not enable build execution until the isolated-worker adversarial gate passes. Do not enable public execution until `GENERATED_PUBLIC_ORIGIN` is a separate cookie-free HTTPS origin and browser tests prove control-plane cookies and authenticated API responses are unavailable there. Disabling either capability never deletes snapshots, artifacts, attempts, last-good previews, or published deployment metadata.

If Headroom compression is enabled in 9Router, use this Docker-internal proxy URL:

```text
http://headroom:8787
```

## Isolated runtime deployment

The active architecture direction is an isolated generated project runtime, documented in `docs/prds/isolated-project-runtime-prd.md` and `docs/architecture.md`.

Current local/single-node behavior:

```text
Next API route -> RuntimeSupervisor interface -> local static server process
Preview route  -> cold-start stopped deployment -> proxy to localhost runtime
Public route   -> cold-start published deployment -> proxy to localhost runtime
Idle worker    -> bun run runtime:idle-stop
```

This adapter is useful for development and a constrained single-node deployment because generated code is served out-of-process from built artifacts. It is not the final production container boundary.

Production deployment should split the same planes into additional services:

```text
build worker:        turns ProjectSnapshot rows into artifacts/images
runtime supervisor: starts/stops isolated ProjectDeployment runtimes
runtime proxy:       routes preview/public traffic to active deployments
container runtime:   Docker or another runtime owned by the supervisor layer
artifact storage:    object storage for source/build artifacts
```

Rules for that deployment shape:

- The Next app remains the control plane and should not mount or own the Docker socket in production.
- Docker socket access, if Docker is used, belongs only to a supervisor service with narrow authority.
- The supervisor/proxy should support scale-to-zero: idle deployments stop, and later traffic can cold-start them.
- Run `bun run runtime:idle-stop` from cron/systemd/timer-equivalent until a long-running worker owns idle enforcement.
- Runtime nodes are capacity locations. A single VPS can start with one node, but the data model must allow more nodes later.
- Public ingress should expose only the app/proxy routes required for users. It must not expose Postgres, Docker socket access, runtime supervisor admin endpoints, Headroom, provider keys, or object storage credentials.
- Local upload persistence remains required while `OBJECT_STORAGE_PROVIDER=local`; generated runtime artifacts should move to object storage before multi-node runtime work.

## Monitoring

Sentry is optional locally. Leave Sentry env vars empty unless testing monitoring.

```env
SENTRY_DSN=""
NEXT_PUBLIC_SENTRY_DSN=""
```

Production uses deployment secrets:

```env
SENTRY_DSN="https://example.ingest.sentry.io/project-id"
NEXT_PUBLIC_SENTRY_DSN="https://example.ingest.sentry.io/project-id"
```

If source maps are uploaded during production builds, set the auth token only in CI/deployment secrets:

```env
SENTRY_AUTH_TOKEN="set-in-deployment-secrets"
```

Never commit `SENTRY_AUTH_TOKEN`, `.env.sentry-build-plugin`, or real DSNs/tokens.

Langfuse is optional for AI tracing. In local development, `bun run infra` starts it with the rest of the AI stack; open `http://localhost:3001`. In production, prefer a protected Langfuse hostname (for example `langfuse.umkmcepat.com`) or Langfuse Cloud; do not expose ClickHouse, Redis, Postgres, or MinIO directly. Set only server-side `LANGFUSE_*` env vars on the app container.

## Notes

- `Dockerfile` uses `bun install --frozen-lockfile --ignore-scripts` so install-time scripts do not require a live DB during image build.
- Prisma client is generated during image build.
- Migrations run once through the production Compose `migrate` service before application startup.
- Canonical local artifacts use the dedicated `project_artifacts` volume; runtime/build workspaces are not canonical.
- Local upload data, logs, screenshots, `.next/`, `.pi/`, `.browser/`, `graphify-out/`, `storybook-static/`, and coverage artifacts must stay untracked.
