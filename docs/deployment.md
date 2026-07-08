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
```

Optional AI gateway:

```bash
bun run infra:ai
```

```text
9Router: http://localhost:20129
```

Use local Node/Bun for the Next.js dev server because bind-mounted Docker dev can make `.next` and file watching stale on some host filesystems.

If `.next` gets stale, stop the dev server, remove `.next`, then restart `bun run dev`.

## Production Compose

Build and start production services:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Production Compose runs:

```text
app container:      Next.js production server
postgres container: database, unless using managed Postgres
9router container:  AI gateway dashboard/API
headroom container: optional context compression proxy
uploads volume:     local upload persistence for OBJECT_STORAGE_PROVIDER=local
```

Current production Compose does not yet include an isolated generated-project runtime supervisor, build worker, proxy plane, or per-project runtime containers. The current preview path still serves generated static build files through the platform app from stored project artifacts.

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
9router.umkmcepat.com  -> protected access     -> http://localhost:20129
```

The app image runs migrations before the production server starts:

```bash
bunx prisma migrate deploy && bun run start
```

## Minimum production env

```env
NEXT_PUBLIC_APP_URL="https://umkmcepat.com"
NEXTAUTH_URL="https://umkmcepat.com"
NEXTAUTH_SECRET="replace-with-strong-secret"
GOOGLE_CLIENT_ID="replace"
GOOGLE_CLIENT_SECRET="replace"
AI_PROVIDER="9router"
NINE_ROUTER_BASE_URL="http://9router:20128/v1"
NINE_ROUTER_API_KEY="replace-with-9router-api-key"
RATE_LIMIT_PROVIDER="memory"
OBJECT_STORAGE_PROVIDER="local"
LOCAL_UPLOAD_DIR=".data/uploads"
PROJECT_ARTIFACT_DIR=".data/project-artifacts"
PROJECT_RUNTIME_DIR=".data/project-runtimes"
PROJECT_BUILD_WORKSPACE_DIR=".data/project-build-workspaces"
PROJECT_RUNTIME_SUPERVISOR="local"
PROJECT_RUNTIME_MAX_CONTAINERS="8"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="replace-with-strong-db-password"
POSTGRES_DB="umkmcepat"
```

If `OBJECT_STORAGE_PROVIDER="local"`, mount `LOCAL_UPLOAD_DIR` as a persistent volume. The current generated-runtime adapter also needs `PROJECT_ARTIFACT_DIR` and `PROJECT_RUNTIME_DIR` on persistent local storage for a single-node VPS. `PROJECT_BUILD_WORKSPACE_DIR` is a rebuildable cache for generated app workspaces; persisting it speeds repeat builds by keeping `node_modules`, but deleting it is safe because source snapshots and dist artifacts remain canonical. If a future deployment uses remote artifact storage, the local artifact/runtime volumes can become rebuildable caches.

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

## Notes

- `Dockerfile` uses `bun install --frozen-lockfile --ignore-scripts` so install-time scripts do not require a live DB during image build.
- Prisma client is generated during image build.
- Migrations run at container startup.
- Local upload data, logs, screenshots, `.next/`, `.pi/`, `.browser/`, `graphify-out/`, `storybook-static/`, and coverage artifacts must stay untracked.
