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
```

`bun run infra` starts Postgres plus the local AI/observability stack: 9Router and Headroom. Use `bun run infra:minimal` only when you need Postgres without AI/observability. Use `bun run infra:down` to stop every container attached to the project's Compose network and remove that network; named data volumes remain intact for the next startup.

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
uploads volume:     local upload persistence for STORAGE_PROVIDER=local
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
RATE_LIMIT_PROVIDER="memory"
STORAGE_PROVIDER="r2"
S3_ENDPOINT=""
S3_REGION="auto"
S3_ACCESS_KEY_ID="replace-with-r2-access-key-id"
S3_SECRET_ACCESS_KEY="replace-with-r2-secret-access-key"
S3_PUBLIC_BUCKET="umkmcepat-public"
S3_PRIVATE_BUCKET="umkmcepat-private"
S3_PUBLIC_BASE_URL="https://media.umkmcepat.com"
S3_ACCOUNT_ID="replace-with-cloudflare-account-id"
GENERATED_BUILD_EXECUTION_ENABLED="false"
GENERATED_PUBLIC_EXECUTION_ENABLED="false"
GENERATED_PUBLIC_ORIGIN="https://generated.example.net"
WAITLIST_ENABLED="true"
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="no-reply@yourdomain.com"
OTP_SPACE_API_KEY="sk_live_..."
NEXT_PUBLIC_UMAMI_WEBSITE_ID="..."
NEXT_PUBLIC_UMAMI_SCRIPT_SRC="https://umami.example.com/script.js"
PROJECT_RUNTIME_DIR="/app/.data/project-runtimes"
PROJECT_BUILD_WORKSPACE_DIR="/app/.data/project-build-workspaces"
PROJECT_THUMBNAIL_CAPTURE_ENABLED="true"
PROJECT_THUMBNAIL_BROWSER_PATH=""
PROJECT_RUNTIME_SUPERVISOR="noop"
PROJECT_RUNTIME_MAX_CONTAINERS="8"
PROJECT_RUNTIME_HEALTH_TIMEOUT_MS="2000"
PROJECT_RUNTIME_PROXY_TIMEOUT_MS="15000"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="replace-with-strong-db-password"
POSTGRES_DB="umkmcepat"
```

Project-card thumbnails are derived JPEGs captured by a headless browser (`PROJECT_THUMBNAIL_CAPTURE_ENABLED`/`PROJECT_THUMBNAIL_BROWSER_PATH`) and stored in the private S3 bucket (`project-thumbnail:s3-private:` refs). The production image installs Chromium plus Node, fixes `PROJECT_THUMBNAIL_BROWSER_PATH`, and enables capture. Capture runs in a disposable Node subprocess so a renderer timeout kills only that process tree, not the application. Development and production therefore use the same successful-build capture lifecycle. Missing thumbnails safely use the deterministic project gradient; opening a private preview makes one best-effort recovery attempt only when the latest successful build has no thumbnail. Capture failures never invalidate successful build artifacts.

Object storage is one S3 code path through `src/lib/s3-client.ts`. In prod, `STORAGE_PROVIDER="r2"` points at Cloudflare R2 (leave `S3_ENDPOINT` empty; the SDK derives the host from `S3_ACCOUNT_ID`); fill `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` and the two `S3_*_BUCKET` names, and point `S3_PUBLIC_BASE_URL` at the public CDN (`https://media.umkmcepat.com`). The local `STORAGE_PROVIDER="local"` path uses RustFS in `bun run infra` and is dev-only; prod does not run RustFS. `PROJECT_RUNTIME_DIR` and `PROJECT_BUILD_WORKSPACE_DIR` are rebuildable. A future isolated worker may own a trusted toolchain cache, but generated executable state must not persist across tenants.

`GENERATED_BUILD_EXECUTION_ENABLED` and `GENERATED_PUBLIC_EXECUTION_ENABLED` are containment switches. Production Compose hardcodes both to `false` and `PROJECT_RUNTIME_SUPERVISOR` to `noop`; values copied from the development `.env.example` cannot override those boundaries. Do not enable build execution until the isolated-worker adversarial gate passes. Do not enable public execution until `GENERATED_PUBLIC_ORIGIN` is a separate cookie-free HTTPS origin and browser tests prove control-plane cookies and authenticated API responses are unavailable there. Disabling either capability never deletes snapshots, artifacts, attempts, last-good previews, or published deployment metadata.

If Headroom compression is enabled in 9Router, use this Docker-internal proxy URL:

```text
http://headroom:8787
```

## Isolated runtime deployment

The active architecture direction is an isolated generated project runtime, documented in `docs/architecture.md`.

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
- Local upload persistence remains required while `STORAGE_PROVIDER=local`; generated runtime artifacts should move to object storage before multi-node runtime work.

## Monitoring

Error tracking is intentionally not wired (Sentry was removed). If error tracking is needed later, GlitchTip is Sentry-API-compatible and slots in behind a fresh adapter without rewriting call sites.

Usage/behavior analytics: **Umami** (self-hosted in `docker-compose.prod.yml`, shares the platform Postgres) — pageviews + custom events via `src/lib/analytics.ts` `track()`. Dev-off; prod-on via `NEXT_PUBLIC_UMAMI_*`. Never on `/api/*` or `/p/<slug>` (generated sites are the user's, not the platform's to instrument).

Availability monitoring: **Uptime Kuma** (self-hosted, standalone SQLite) — pings the app + key endpoints, alerts on downtime. Configure monitors at `http://<server>:3002` after first boot.

## Notes

- `Dockerfile` uses `bun install --frozen-lockfile --ignore-scripts` so install-time scripts do not require a live DB during image build.
- Prisma client is generated during image build.
- Migrations run once through the production Compose `migrate` service before application startup.
- Canonical local artifacts use the dedicated `project_artifacts` volume; runtime/build workspaces are not canonical.
- Local upload data, logs, screenshots, `.next/`, `.pi/`, `.browser/`, `graphify-out/`, `storybook-static/`, and coverage artifacts must stay untracked.
