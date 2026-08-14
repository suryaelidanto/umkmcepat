# Runtime Recovery Design (Self-Heal + Owner Restart)

**Status:** Approved for planning
**Date:** 2026-08-04
**Related:** `2026-07-27-rustfs-local-s3-design.md`, `DEV.md` Local runtime section

## Problem

A preview site can break if its on-disk serving copy (the "docroot") is removed
while the static-server process stays alive. This happens when the
`project-runtimes` directory (currently `.data/project-runtimes/`, later an OS
temp scratch dir) is deleted out from under a running preview deployment.

Concretely: the dist is safe in S3 (`project-artifacts/dist/...`), but the local
materialized copy that the static server reads is gone. The server is alive and
serves **404** for every path.

### Why it does not self-heal today

1. `isRuntimeReachable` (`runtime-supervisor.ts`) treats any HTTP status
   `< 500` as "healthy". A static server with an empty docroot returns **404**,
   and `404 < 500`, so the deployment is considered running.
2. The proxy (`runtime-proxy.ts`) only calls `startDeployment` when the status is
   **not** `running`. Because the health check reports `running`, `startDeployment`
   is never called, so the S3 dist is never re-materialized.
3. The idle worker (`runtime-idle.ts`) only stops deployments idle past a timeout.
   Active visitors keep `lastRequestAt` fresh, so the deployment never idles and
   never gets a chance to restart.

Net effect: a deleted docroot leaves the preview permanently broken with no user
action and no automatic recovery.

### What must recover

- The **dist** is durable in S3. Recovery means **re-materializing** it to disk
  (fetch S3 → write docroot → serve). This is cheap, does **not** run the AI, and
  does not create a new artifact.
- If the S3 dist is also gone, there is nothing to restore; the owner must run a
  full rebuild (expensive, AI, creates a new artifact). This path already exists
  as `startBuild` → `/api/projects/:id/generate`.

## Goals

- **G1 (automatic):** a broken preview (404 docroot) recovers on the next page
  load with **zero user action**, by re-materializing the S3 dist.
- **G2 (manual, owner-only):** the project owner can explicitly restart a preview
  deployment (stop + start, re-materialize from S3) from the UI.
- **G3 (security):** neither recovery path can be triggered by a non-owner, and
  neither spends AI credits without the owner's explicit full rebuild.

## Non-goals

- Not relocating the `.data/` scratch (separate effort).
- Not adding a proactive cron sweep of all deployments (lazy recovery is cheaper
  and sufficient for previews).
- Not changing the full-rebuild flow (`/generate`).

## Design

### Detection: a 404 on the health path means broken

The health probe requests `/`, which always resolves to `index.html` via the
static server's fallback. A healthy site never 404s `/`. Therefore:

- `isRuntimeReachable` returns unhealthy when the health response is `404`
  (in addition to `>= 500` and network errors).
- This makes `getDeploymentStatus` return `stopped` for a broken deployment.
- The proxy then calls `startDeployment`, which runs
  `materializeProjectDistArtifact` (S3 → docroot) before spawning the server.
- The site recovers on the next request. **No user action, no cron.**

### Manual restart (owner-only)

New endpoint `POST /api/projects/:id/restart`:

1. Authenticate. Return 401 if no session.
2. `verifyProjectOwnership(id, userId)`. Return 404 if not owner.
3. Find the active preview deployment (newest preview deployment whose build has
   an artifactRef).
4. If none: return 404 with a message telling the user to run a build.
5. `stopDeployment(id)` then `startDeployment(id)` (re-materializes from S3).
6. Return `{ ok: true }`.

The UI's existing recovery hook (`recoverPreviewRuntime`) currently only bumps a
reload key and invalidates the runtime query. It will be changed to call
`/restart` and then reload runtime state.

### UI copy (Indonesian, user-facing)

- Restart button: "Muat ulang tampilan" — re-materializes the existing build
  (cheap). Distinct from the existing full rebuild "Buat ulang website".
- Keep the existing full-rebuild path untouched.

## Security analysis

- **Full rebuild** (`/generate`): already owner-scoped via
  `findFirst({ where: { id, userId } })`. Unchanged.
- **Manual restart** (`/restart`): added `verifyProjectOwnership`. Non-owner gets
  404.
- **Automatic re-materialize** (health-check fix): only re-serves the owner's own
  existing S3 artifact. It spends no AI credits and creates nothing. It runs only
  within the preview route, which is already scoped by `userId`
  (`preview.$.ts`). No exposure.

## Reliability

- Lazy recovery: works for any broken preview on the next page load.
- Idle worker: with the health-check fix, a broken deployment that idles out also
  recovers on its next request. No change needed, but the fix makes this
  consistent.
- Edge case (out of scope): an **unfinished** build has no S3 artifact yet; neither
  path can restore it. This is a build-atomicity concern, not a recovery concern.

## Files

- Modify: `src/lib/projects/runtime-supervisor.ts` — health-check 404 detection.
- Modify: `src/lib/projects/runtime-supervisor.test.ts` — test 404 → stopped.
- Create: `src/routes/api.projects.$id.restart.ts` — owner-only restart endpoint.
- Create: `tests/routes/projects.id.restart.test.ts` — endpoint tests.
- Modify: `src/components/projects/WorkspaceShell.tsx` — `recoverPreviewRuntime`
  calls `/restart`.
- Modify: `src/components/projects/WorkspacePrimitives.tsx` — restart button UI.
- Modify: `src/components/projects/WorkspacePrimitives.test.ts` — UI copy test.
- Modify: `DEV.md`, `docs/superpowers/specs/2026-07-27-rustfs-local-s3-design.md`
  — document recovery behavior.
