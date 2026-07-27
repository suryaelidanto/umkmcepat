# Analytics Provisioning — Design

**Date:** 2026-07-27
**Status:** Design — awaiting plan
**Topic:** Umami auto-provisioning (admin + website + env wiring)

## Problem

Umami + Uptime Kuma are integrated (compose services, `analytics.ts`, `__root.tsx` script tag, init SQL for the `umami` DB shell) but the app-level setup — creating the Umami admin account + website and writing the resulting `Website ID` into `.env` — is manual. Manual steps get skipped, done out of order, or forgotten on first deploy, leaving `track()` a silent no-op with no visible failure.

`src/lib/analytics.ts` was also gated `NODE_ENV !== "production"` (dev-off). That made local verification impossible without a prod-mode build. The guard is removed (separate uncommitted edit) so `track()` fires whenever `NEXT_PUBLIC_UMAMI_WEBSITE_ID` is set — dev or prod. This spec covers the remaining gap: getting that ID set, automatically.

## Non-goals (YAGNI — explicit)

- **Uptime Kuma auto-provisioning.** Kuma's setup is socket.io-based, no clean REST, and its SQLite schema is internal/upgrade-fragile. Manual setup (create admin + add one HTTP monitor, ~30s, one-time) is cheaper than maintaining fragile seeding. Kuma has no env dependency from the app, so nothing to wire. **Out of scope.**
- **Custom in-app analytics/status dashboard.** Umami + Kuma ship maintained dashboards at `:3001` / `:3002`. A custom proxy version rebuilds maintained UIs. **Out of scope.** (Sibling admin-dashboard agent `wZ:pR` is speccing a separate `/admin` tabbed shell for users/waitlist/transactions/settings — that work owns the admin UI surface; this spec does not touch it.)
- **In-app `/api/admin/provision-umami` route.** Couples an ops task to the running app (chicken-egg: app needs the Umami ID to fully work, but the route lives in the app). Adds auth surface for a one-time op. **Out of scope.**
- **Shell script + curl/jq variant.** Project is Bun-first (CLAUDE.md). **Out of scope.**
- **Self-check test harness.** Ops script, idempotent by construction (skip-existing + atomic env write). Re-running IS the test. No `--self-check` flag. **Out of scope.**

## Architecture + boundary

Single ops script `scripts/provision-analytics.ts`, run manually via `bun run provision:analytics`. Not part of `bun run infra` (keep daily dev lean). Not part of CI (provisioning is env-specific, no-op without a live Umami). Pure developer/VPS tool.

**Boundary:** script talks to Umami's REST API over HTTP only. Knows nothing about Umami's DB schema, Postgres, or Docker. Writes exactly one file: `.env` (the two `NEXT_PUBLIC_UMAMI_*` lines). Reads: `.env` (Bun auto-loads → `process.env`). No app imports, no Prisma, no shared libs, no Docker shell-out.

The `umami` *database shell* is created by a separate, already-existing infra layer — `docker/init/10-create-umami-db.sql` mounted into both composes — which fires automatically on first Postgres volume init. That layer is below this script; this script assumes the shell exists (Umami's own Prisma migrations create tables inside it on Umami's first boot).

## Data flow

```
.env (read UMAMI_ADMIN_PASSWORD, UMAMI_BASE_URL)
  ↓
Phase A — resolve config
  base     = UMAMI_BASE_URL || "http://localhost:3001"
  pass     = UMAMI_ADMIN_PASSWORD
  username = "admin" (hardcoded)
  name     = "UMKM Cepat" (hardcoded)
  domain   = GENERATED_PUBLIC_ORIGIN || "localhost"
  prod guard: NODE_ENV=production && !pass → throw "UMAMI_ADMIN_PASSWORD required"
  dev guard: !pass → console.warn "dev default 'umkmcepat' in use" + pass = "umkmcepat"
  Phase B — provision (idempotent, REST only)
  Cookie handling: a single `Headers` instance is reused across all calls; `fetch`'s `credentials: "include"` + manual `set-cookie` parsing from each response keeps the Umami session attached for steps 2–4.
  1. login: POST {base}/api/auth/login {username, password}
     → 200 + Set-Cookie → admin exists, session cookie stored on the shared Headers
     → 401 → admin not created yet → fall to setup
  2. setup (only if login 401'd): POST {base}/api/auth/setup {username, password}
     → 200 + cookie → admin created, cookie stored
     → 400 "user already exists" → fall back to login (race; treat as provisioned)
  3. GET {base}/api/websites (with cookie)
     → find website where name === "UMKM Cepat"
     → found → websiteId = existing.id (skip create)
     → missing → POST {base}/api/websites {name, domain} → websiteId
  4. scriptSrc = base + "/script.js"
  ↓
Phase C — write .env (idempotent, atomic)
  read .env (missing → throw "cp .env.example .env first")
  for each of NEXT_PUBLIC_UMAMI_WEBSITE_ID, NEXT_PUBLIC_UMAMI_SCRIPT_SRC:
    line exists → replace value in place
    line absent → append
  write atomically (tmp file + rename)
  print: "✓ Umami provisioned — websiteId=<id>, scriptSrc=<src>, .env updated. Restart dev/app to load."
```

## Env vars (1:1 in `.env` + `.env.example`, per CLAUDE.md rule)

New (OVERRIDE/optional section):
- `UMAMI_ADMIN_PASSWORD=""` — dev: empty = default `umkmcepat` + warn; prod: required (script errors).
- `UMAMI_BASE_URL="http://localhost:3001"` — Umami base; dev default localhost, prod = `https://umami.<yourdomain>`.

Existing (kept, now written by the script):
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID=""`
- `NEXT_PUBLIC_UMAMI_SCRIPT_SRC=""`

Hardcoded (not env — they don't change across environments meaningfully):
- `username="admin"`
- `websiteName="UMKM Cepat"`
- `websiteDomain` derived from existing `GENERATED_PUBLIC_ORIGIN` or `"localhost"`.

## package.json

One script entry: `"provision:analytics": "bunx tsx scripts/provision-analytics.ts"`.

## docs/deployment.md

Two changes in the Monitoring section:
1. Line 167 currently says "Dev-off; prod-on via `NEXT_PUBLIC_UMAMI_*`." — **stale** after the `analytics.ts` dev-on edit. Fix to: "Fires whenever `NEXT_PUBLIC_UMAMI_WEBSITE_ID` is set (dev or prod); dev `.env` points at a local Umami container, prod at the prod instance — no cross-pollution."
2. Add a line under the Umami paragraph: "After first `docker compose -f docker-compose.prod.yml up -d umami`, run `bun run provision:analytics` once to create the admin account + website and write the Website ID into `.env`. Idempotent — safe to re-run after wipes/upgrades (skips existing admin/website, preserves data + password)."

## Idempotency + error handling

- **Pure idempotent:** re-run skips existing admin (login succeeds → never calls setup) and existing website (GET finds it → never POSTs a duplicate). No data reset, no password change.
- **Prod guard:** `NODE_ENV=production` + empty `UMAMI_ADMIN_PASSWORD` → throw, exit 1. Prevents accidental dev-default password on a public deploy.
- **Umami not reachable:** fetch throws → script exits non-zero with the URL. Operator brings up Umami, re-runs.
- **`.env` missing:** throw "cp .env.example .env first" — don't silently create one.
- **Atomic env write:** write to `.env.tmp`, `fs.renameSync` → `.env`. Crash mid-write never corrupts `.env`.
- **Auth drift (setup returns 400 "user exists" but login then 401s):** print a clear "manual intervention: reset Umami admin via its DB" message + exit non-zero. Don't loop.

## Coordination (herdr-collab)

Sibling agent `wZ:pR` ("User role vs env admin check") is speccing a separate `/admin` tabbed shell (users/waitlist/transactions/settings). Its file set: `prisma/schema.prisma`, `src/routes/_main.admin*.tsx`, `src/lib/{app-settings,auth-admin,waitlist-enabled,pakasir,rate-limit}.ts`, `docs/architecture.md`. This spec's file set is disjoint: `scripts/provision-analytics.ts` (new), `.env`, `.env.example`, `docs/deployment.md`, `package.json`, `src/lib/analytics.ts`. Only theoretical overlap = `.env` if admin-dashboard later adds vars; `wZ:pR` committed to re-check first. Coord note logged at `.superpowers/sdd/coord-analytics-prov.md`.

## Testing

No unit tests (ops script, YAGNI per non-goals). Verification is end-to-end, manual, once:

1. `docker compose -f docker-compose.prod.yml up -d umami` → container healthy, HTTP 200 at `:3001`.
2. `bun run provision:analytics` with empty `UMAMI_ADMIN_PASSWORD` in `.env` → prints dev-default warning, provisions admin + website, writes `.env`.
3. `cat .env | grep NEXT_PUBLIC_UMAMI` → both lines populated.
4. `bun run dev` → load homepage → DevTools Network sees `script.js` (200) + `/api/send` (200) on navigation → Umami Live view shows a pageview within ~5s.
5. Re-run `bun run provision:analytics` → no duplicate website created, no password change, `.env` unchanged (same values).
6. Prod guard: `NODE_ENV=production bun run provision:analytics` with empty password → exits non-zero with "required" message.
