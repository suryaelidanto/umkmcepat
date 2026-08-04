# Ban Unpublishes Published Projects Design

**Status:** Approved for planning
**Date:** 2026-08-04
**Related:** `2026-07-29-blocked-user-page.md`, `2026-08-04-runtime-recovery-design.md`

## Problem

Banning a user (`Admin` → `api.admin.users.$id.ts` `action=ban`, which sets
`User.bannedAt`) only locks the user out of their **dashboard**. It does nothing
to their published websites.

Today a published site is served entirely by slug in `src/routes/p.$slug.$.ts` —
no ownership check, no ban check. Worse, `runtime-proxy.ts:46` calls
`startDeployment` for any non-running deployment on the next request, so even
stopping a deployment does not keep a site down (it auto-restarts). The site also
stays in Google via `src/routes/sitemap[.]xml.ts`, which lists every
`kind:"published"` deployment.

Concretely: if a user builds and publishes a judi-online (illegal gambling) site,
the operator's "Blokir" (ban) button is expected to take it offline — but it
does not. The offending site keeps serving and stays indexed.

## Goals

- **G1 (takedown):** banning a user makes all of their published sites stop
  serving publicly (410 Gone) with no further operator action.
- **G2 (reversible):** unbanning restores the sites exactly as they were. Nothing
  is deleted. This also covers the accidental-ban case.
- **G3 (deindex):** a banned user's published sites are signaled to Google as
  removed (410) and dropped from the sitemap.
- **G4 (hygiene):** at ban time, running published containers for that user are
  stopped best-effort to free resources.

## Non-goals

- **No per-project ban.** User-level ban covers current and future projects; a
  per-project column/UI is a later additive feature if moderation ever needs
  "take down one site, keep the account."
- **No deletion / teardown.** Full resource teardown is reserved for illegal-hosted
  content cases where retaining copies is a liability; that is a separate explicit
  admin action, not the ban default.
- **No schema change.** Reuses existing `User.bannedAt`.

## Design

### Serve-time gate: the single enforcement point

`src/routes/p.$slug.$.ts` already resolves the active published deployment and
proxies it. Extend its query to reach the deploying owner, then reject the
request if that owner is banned:

1. Add a nested select to the published-deployment query so it returns the
   owner's `bannedAt`:
   `build → snapshot → project → user → { bannedAt }`.
2. After `selectActivePublishedDeployment`, if
   `deployment.build.snapshot.project.user.bannedAt` is set, return **410 Gone**
   via the existing `createPublicIssueResponse`, with `X-Robots-Tag: noindex`
   and `Cache-Control: no-store`. Never reach the proxy, so the runtime stays
   down and is never auto-restarted.

This single gate delivers G1, G2, and (via the 410 status) G3. On unban the flag
clears and the next request resolves and auto-starts the deployment again — no
unban-side code required.

### Sitemap hygiene

`src/routes/sitemap[.]xml.ts` adds the same nested select and filters out
deployments whose owner is banned. The 410 already triggers deindexing; this
avoids advertising banned URLs in the sitemap in the meantime.

### Ban-side container stop (hygiene)

`api.admin.users.$id.ts` `action=ban` handler: query the user's published
deployments, and best-effort `getRuntimeSupervisor().stopDeployment(id)` each
(dynamic import, non-fatal, `.catch(() => undefined)` like the existing email).
This frees resources; correctness of the takedown does not depend on it because
the serve-time gate already prevents the proxy from starting them.

`action=unban` stays untouched.

## Security analysis

- **Serve-time gate** runs in the public `p/$slug` route, which is already
  unauthenticated (slug is the only gate). The added owner ban check leaks no
  new information — it returns a generic 410 page, same as other public-issue
  responses. No PII exposed.
- **Ban handler** is already guarded by `requireAdmin()`. Stopping containers is
  best-effort and non-fatal; a failure cannot break the ban.

## Reliability

- **Takedown is lazy and idempotent**: the 410 is decided per-request from the
  DB flag; re-banning or multiple requests are harmless.
- **Unban is automatic**: no migration, no state to flip back; the gate is a live
  read of `User.bannedAt`.
- **No new failure modes for active users**: non-banned owners follow the exact
  current path; the added nested select only adds the owner's `bannedAt`.

## Files

- Modify: `src/routes/p.$slug.$.ts` — serve-time ban gate returning 410.
- Modify: `tests/routes/p.slug.splat.test.ts` — banned-owner 410 test; active-owner
  200 regression.
- Modify: `src/routes/api.admin.users.$id.ts` — stop published containers on ban.
- Modify: `src/routes/api.admin.users.$id.test.ts` — assert ban stops containers.
- Modify: `src/routes/sitemap[.]xml.ts` — exclude banned owners' deployments.
- Create: `tests/routes/sitemap.test.ts` — banned deployment excluded.
- Modify: `DEV.md` — document ban → unpublish behavior.
