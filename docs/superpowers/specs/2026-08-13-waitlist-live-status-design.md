# Waitlist Live Status and Admin Queue Consistency

**Date:** 2026-08-13
**Status:** Approved for implementation by direct user instruction
**Scope:** Waitlist approval, rejection, and live client state
**Related decisions:** `2026-07-29-admin-self-approve-on-waitlist-design.md`, `2026-07-30-waitlist-homepage-access-design.md`

## Goal

A waitlist decision should become visible in every relevant open surface without a browser refresh. The admin queue, admin counts, homepage gate, waitlist screen, and approval redirect must all converge on the database-backed status while preserving the existing server-side authorization and route gates.

The experience should feel live for the pilot without introducing a realtime transport. Bounded polling plus focus/reconnect refetching is the correct scale for this workflow.

## Current failure

The database mutation already succeeds, but the browser state is fragmented:

- `/admin/waitlist` invalidates only its admin-list and nav-count queries.
- The shared `waitlistStatus` query is not invalidated after an admin decision.
- `/waitlist` owns a separate `ownQuery`, while polling belongs to `statusQuery`; polling can learn about approval while the rendered branch still reads the old own-entry query.
- The local `submitted` flag can keep the success screen mounted after a later server response says `rejected` or `approved`.
- The `/waitlist` route has no central approval transition, so a user who stays on that page can remain there after approval.
- Admin overview counts only `pending`, while the queue and nav count both `pending` and `waitlisted`.
- Approval updates the waitlist row before the signup Energy grant. If the grant fails, the request can report failure after the status is already committed, leaving an ambiguous partial result.

## Decisions

### 1. One canonical client query

`queryKeys.waitlistStatus` is the single client source of truth for the signed-in user's effective gate status and own waitlist entry:

```ts
{
  status: string | null;
  own: {
    businessName: string;
    businessType: string | null;
    id: string;
    rejectionReason: string | null;
    status: string;
    story: string;
  } | null;
  canUseDevTools?: boolean;
}
```

The `/waitlist` page uses this query for both gate status and own-entry rendering. The old `['user', 'waitlist', 'own']` observer is removed from the page; the invalidation helper no longer treats two independent caches as authoritative.

The route loader still provides the initial own entry for first paint. The client query is marked stale immediately (`initialDataUpdatedAt: 0`) so the server remains authoritative after hydration and after an admin decision.

### 2. Bounded polling, not a new realtime service

- A user with a pending or waitlisted entry polls `/api/user/waitlist` every **15 seconds**.
- The query already refetches on window focus and reconnect; those behaviors remain enabled.
- A just-submitted form continues polling briefly even if the first response has not yet returned the own entry, preventing a transient empty response from stopping convergence.
- Polling stops as soon as the effective status is approved, rejected, or there is no pending entry.
- The admin waitlist queue polls every **15 seconds** while open.
- Admin nav counts and overview data poll every **30 seconds** so new submissions appear without navigation while keeping background traffic bounded.

Polling is only a freshness mechanism. Authorization and approval decisions remain server-side.

### 3. Shared invalidation after admin decisions

Add one client helper, `invalidateAdminWaitlistData(queryClient)`, that invalidates active observers for:

- `queryKeys.adminWaitlist`
- `queryKeys.adminNavCounts`
- `queryKeys.adminOverview`
- `queryKeys.waitlistStatus` (the signed-in admin's own status, including dev self-approval)

`invalidateWaitlistStatus(queryClient)` remains the user-facing helper. Admin approve/reject awaits the shared invalidation before showing success. A user's other browser/tab is not directly mutated; its pending query catches up through the 15-second poll or focus/reconnect refetch. No `BroadcastChannel`, WebSocket, or SSE is added.

### 4. User transition states

The waitlist page derives one explicit view state from the canonical query:

| Server/client state | View | Transition |
| --- | --- | --- |
| effective status `approved` | short approval confirmation | show honest success copy, then SPA navigate to `/` |
| own status `pending`/`waitlisted`, or local submit is awaiting its first fresh response | existing thank-you screen | remain on the page and keep polling |
| own status `rejected` | existing rejection banner and editable form | no refresh; user can correct and resubmit |
| no own entry | existing form | no pending poll |

Approval takes precedence over the local submitted flag. Rejection also takes precedence over that flag, so a later decision cannot leave the user trapped on a stale success screen.

The approval transition uses one guarded effect and a short, visible Indonesian confirmation before `router.replace('/')`. The existing admin self-approve endpoint and authorization remain unchanged at the API boundary; its client mutation invalidates the canonical query and lets the same transition handle both admin self-approval and regular-user approval.

On `/`, no redirect is needed after approval: the existing shared query changes `waitlisted` to false and the homepage naturally reveals the normal prompt/project surface. The same cache is shared by `MainChrome`, `MobileNav`, `HomePage`, and `HomePromptForm`, so they converge together.

### 5. Admin queue behavior

The admin list keeps server-confirmed state as its authority. On approve/reject success it invalidates and refetches the active filter rather than fabricating a status locally. The row therefore disappears from the pending filter (or changes in the all filter) only after the server confirms the mutation. While the request is in flight, the relevant action is disabled and displays an action-specific loading label.

The mutation error path keeps the row visible and shows the existing retryable toast. No failed request hides a user from the queue.

Use shared query keys for admin waitlist, nav counts, and overview to prevent invalidation typos.

### 6. Consistent pending counts

Define the one domain-level pending set:

```ts
['pending', 'waitlisted']
```

Use it for:

- `listPendingWaitlist('pending')`
- `/api/admin/nav-counts`
- `/api/admin/overview`

This changes no status values; it only makes all admin surfaces count the same work queue.

### 7. Atomic approval and signup grant

Approval and the one-time pilot Energy grant must commit together when an existing signed-in user is linked during admin approval:

1. Start a Prisma transaction.
2. Update the waitlist entry to `approved`.
3. Resolve/link the matching user if needed.
4. Insert the idempotent `grant:pilot` credit through the transaction client.
5. Commit; only then return success and send the non-fatal email.

`grantSignupEnergy` gains an optional transaction client used only by this path. Existing signup/link-account and admin-grant callers keep their current behavior and signatures at their call sites. A grant failure rolls back the approval update instead of returning an ambiguous partial failure. The unique pilot-grant index continues to make retries safe.

No schema migration is needed.

## Data flows

### Admin approves a user

```text
Admin click
  → POST /api/admin/waitlist
  → requireAdmin()
  → transactional approval + user link + pilot grant
  → 200 approved
  → admin invalidation helper
       ├─ queue refetch
       ├─ nav count refetch
       ├─ overview refetch when active
       └─ current admin waitlist-status refetch
  → user browser remains safe and catches up by poll/focus
```

### User is approved in another browser

```text
User /waitlist or / homepage
  → shared /api/user/waitlist query
  → pending poll every 15s / focus / reconnect
  → status approved + own approved
  → /waitlist shows approval confirmation and navigates to /
  → / homepage changes from waitlisted banner to product surface
```

### User is rejected or resubmits

```text
Admin rejection
  → user's next shared-query refresh returns rejected + reason
  → /waitlist leaves the thank-you branch and shows reapply form
  → submitWaitlist upsert resets status to pending
  → invalidate shared query
  → thank-you branch returns without reload
```

## Error handling and safety

- Server authorization remains `requireAdmin()`; no client cache change grants access.
- The server route gate remains the final authority on product navigation.
- Query failures preserve the last known good state and use existing retry/focus behavior; no failure is converted into approval.
- Admin mutation failures keep the queue row visible and show a retryable error.
- Approval transaction failures leave the waitlist row in its previous status.
- Email remains non-fatal and is sent only after the primary database operation succeeds.
- Polling intervals are fixed and bounded; there is no unbounded retry loop or per-user connection.
- Existing dev skip/reset behavior stays intact and remains development/admin protected.
- No secrets, user data, or private evidence are added to logs or docs.

## Testing strategy

### Unit tests

- `waitlistPendingPollInterval` still polls only for pending/waitlisted entries, with the new 15-second interval.
- A pure waitlist-view resolver proves approval wins over local submitted state, rejection wins over local submitted state, and pending submissions show the thank-you view.
- `invalidateAdminWaitlistData` invalidates exactly the four intended query roots with active refetch semantics.
- The shared pending-status set is used consistently and recognizes both `pending` and `waitlisted`.
- Admin waitlist POST approve/reject tests preserve authorization, response status, service calls, and non-fatal email behavior.
- Approval service tests prove the transaction client is passed to the grant and the existing linking paths remain correct.
- Credit tests prove `grantSignupEnergy` can write through a supplied transaction client while the default path still writes through the singleton.

### Integration tests

Against the real PostgreSQL test database:

- approving a linked user commits `approved` and exactly one `grant:pilot` credit;
- repeating approval does not create a second pilot grant;
- the approval transaction rolls back if the transactional grant operation fails.

### Manual browser smoke checks

With two signed-in browser sessions and the same local/dev app:

1. User A submits and stays on `/waitlist`; admin approves from `/admin/waitlist`; User A reaches `/` without refresh.
2. User A stays on `/`; after approval the waitlist banner disappears and the product prompt appears without refresh.
3. Admin rejects a pending entry; the user's `/waitlist` form and rejection reason appear without refresh.
4. User resubmits; the success screen returns and the admin pending queue receives the row without navigation.
5. Admin self-approves from both the waitlist success view and `/admin/waitlist`; no duplicate toast or manual refresh is required.
6. Temporarily fail a mutation request; the admin row remains visible and retry works.
7. Hide the user tab, approve, then focus it; focus refetch converges immediately.

## Files and scope

Expected implementation files:

- `src/lib/query-client.ts` — canonical query types, live intervals, query keys, invalidation helpers.
- `src/lib/waitlist-view.ts` and test — explicit waitlist page state resolver.
- `src/lib/waitlist.ts` and tests — shared pending statuses and transactional approval.
- `src/lib/user-credits.ts` and tests — optional transaction client for pilot grants.
- `src/routes/_main.waitlist.tsx` — one canonical query and approval/rejection transitions.
- `src/routes/_main.admin.waitlist.tsx` — queue polling, shared invalidation, action loading labels.
- `src/components/admin/AdminShell.tsx` — shared nav query key and bounded count polling.
- `src/routes/_main.admin.index.lazy.tsx` — shared overview key and bounded polling.
- `src/routes/api.admin.nav-counts.ts` and `src/routes/api.admin.overview.ts` — consistent pending set.
- `src/routes/-api.admin.waitlist.test.ts` — endpoint regression coverage.
- `tests/integration/waitlist-approval.itest.ts` — real transaction/grant coverage.
- `DEV.md` — document the canonical waitlist cache and bounded polling behavior.

No new dependency, route, database migration, realtime service, or broad component refactor is in scope.

## Rollout and verification gate

1. Add failing tests before production changes.
2. Run focused tests after each TDD slice.
3. Run integration tests when PostgreSQL is available.
4. Run `bun run check`; do not claim completion if it fails.
5. Inspect the final diff and confirm unrelated worktree changes were not staged.
6. Run the manual browser smoke checklist where local auth/infra is available.
7. Commit with a Conventional Commit on `dev`.
8. Follow the `push-dev` workflow, wait for CI, then follow `push-main` only if dev CI is green.
9. Leave the local checkout on `dev` after the release workflow.

## Non-goals

- No WebSocket, SSE, BroadcastChannel, or third-party realtime dependency.
- No redesign of the waitlist form, admin layout, email templates, or homepage.
- No client-only access gate or trust in optimistic status.
- No change to production admin bypass, development admin test semantics, or rejection/resubmission rules.
- No migration of unrelated admin mutations to a new cache abstraction.
