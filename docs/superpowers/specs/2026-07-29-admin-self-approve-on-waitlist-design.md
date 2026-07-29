# Admin self-approve on /waitlist (design)

**Date:** 2026-07-29
**Status:** design — ready for review
**Author:** claude (brainstorming session)

## Context

Today, after a user submits the waitlist form, `/waitlist` shows a "Terima kasih, <businessName>!" success view and the user is stuck waiting for an admin to approve their entry via the `/admin` dashboard. For admins themselves this is a problem: they submit the form (now have a `pending` entry), get the thank-you page, and cannot proceed until they switch to the admin dashboard in another tab and approve their own entry.

This was masked in production because admins were auto-bypassed (`resolveUserWaitlistStatus` returned `approved` for admins in prod). It surfaced in this dev environment because admins in dev are treated like normal users to exercise the full gate flow. Either way, an admin who actually goes through the form is stuck on the success page with no in-place escape.

The dev-mode escape hatches (`/api/dev/skip-waitlist`, "Lewati pendaftaran (admin bypass)") solve a different problem: they auto-create a stub entry server-side and skip the form. They do not help an admin who has already filled the form and is sitting on the thank-you screen.

## Goal

Let admins self-approve their own waitlist entry with one click from the `/waitlist` post-submit view, without weakening any existing access controls.

## Non-goals

- Not changing how regular users experience `/waitlist`.
- Not adding a new admin endpoint, new env var, or new DB column.
- Not changing `/admin` dashboard flow (admins approving other users' entries).
- Not changing dev-mode skip/reset buttons (they still work as before).

## Design

### Behavior

When `isAdmin === true` AND the user is on the post-submit "Terima kasih" view (i.e. they have a `pending` or `waitlisted` own entry), render a single button below the thank-you text:

> **"Setujui saya (admin bypass)"**

Click handler:
1. POSTs to the existing `/api/admin/waitlist` endpoint with body `{ action: "approve", entryId: <admin's own entry id> }`.
2. On success: shows a toast ("Pendaftaran disetujui (admin bypass)."), invalidates the waitlist status query, then `router.replace("/")` after ~1.5s — same UX pattern as the existing dev-skip button.
3. On error: shows a toast with the error message; user stays on the page.

The admin's own entry id is sourced from the existing route loader (`Route.useLoaderData().own.id`) — never from user input, never from the URL, never from another user's row.

### Where it renders

In `src/routes/_main.waitlist.tsx`, the post-submit success view. The page already has three top-level branches driven by `stillPending` (post-submit pending), `isRejected` (rejection banner), and the form. The button goes inside the `stillPending` branch, below the thank-you copy, gated on `isAdmin`.

### Safety model (your explicit ask)

The button is a UI affordance over an already-secured endpoint. There is **no new auth surface**. Three independent checks all hold:

1. **Server-side authorization (real check).** `/api/admin/waitlist` POST already calls `requireAdmin()` before doing anything (src/routes/api.admin.waitlist.ts:14-35). `requireAdmin()` checks `isAdminEmail(email)` which compares against the `ADMIN_EMAILS` env allowlist (src/lib/waitlist.ts:56-66). A non-admin who crafts the same POST manually is rejected with `403 Permintaan ditolak.` No change to this path.
2. **UI gate.** The button is only rendered when `isAdmin === true`. `isAdmin` is already computed in `gateIfApproved` route loader from `isAdminEmail(session.user.email)`. A regular authenticated user never sees the button, period — even though it wouldn't matter because the server-side check still rejects them.
3. **Entry-id trust boundary.** The id passed to the POST is read from `Route.useLoaderData().own.id`, which comes from `getOwnWaitlistEntry(session.user.email)`. It is the entry tied to the signed-in user's email — not a URL param, not a form field, not a user-supplied string. The admin can only ever self-approve their own row. There is no path from this button to approve someone else's entry.

**No new env vars, no new endpoints, no new helpers.** The button is purely a new client-side call into an already-secured server endpoint with an already-trusted id.

### Idempotency

`approveWaitlistEntry(entryId, reviewerId)` (src/lib/waitlist.ts:162-175) sets `status: "approved"` on the entry. Calling it twice is safe — the second call overwrites `reviewedAt` to a new timestamp and keeps `reviewerId = admin.userId`. The UI button hides after success (via state), so double-clicks are also handled.

### What we explicitly do NOT do

- We do not auto-create a stub entry for admins who haven't filled the form. The dev-skip button already does that, restricted to `isDev`. The new button only appears after the admin has a real entry — it acts on a real row, not a synthetic one.
- We do not add a new endpoint for self-approval. The existing admin endpoint handles it; adding another would only expand attack surface.
- We do not change `resolveUserWaitlistStatus`'s dev-vs-prod split. Admins in dev still hit the gate so the full flow is exercisable. Admins in prod still auto-bypass. The new button is the in-place escape that was missing for the "submitted but stuck" case in both envs.

## Components

- `src/routes/_main.waitlist.tsx` — add the button to the pending-success branch. Mutation follows the same pattern as `devSkipMutation` (useMutation + onSuccess toast + invalidateQueries + setTimeout router.replace).
- No new files. No new server code. No new tests required beyond a focused unit test that the button renders for admin and not for non-admin.

## Data flow

1. User (admin) submits form on `/waitlist`.
2. `submitWaitlist` creates entry with `status: "pending"`, returns.
3. `gateIfApproved` re-runs (via query invalidation); since `isApproved` is now `"pending"`, the gate resolves to the pending view.
4. Component re-renders showing the "Terima kasih" view with the new button.
5. Admin clicks button.
6. Client POSTs `{ action: "approve", entryId: own.id }` to `/api/admin/waitlist`.
7. Server: `requireAdmin()` → admin check passes → `approveWaitlistEntry(entryId, admin.userId)` → DB update.
8. Client: invalidates `waitlistStatus` query → `gateIfApproved` re-runs → `isApproved` is now `"approved"` → gate redirects to `/`.

## Testing

One focused test, addition to existing `src/routes/_main.waitlist.test.ts` (or new colocated test):

- Render the post-submit view with `isAdmin=true`, `own={status: "pending", id: "x"}`. Expect button to be present.
- Render the post-submit view with `isAdmin=false`. Expect button to be absent.
- Click triggers `fetch` to `/api/admin/waitlist` with the correct body. (Existing test infra for client mutations applies.)

Server-side authorization is already covered by existing `src/routes/-api.admin.waitlist.test.ts` patterns; no new server tests needed.

## Rollout

- One PR. One commit. Branch from `dev`, push via `push-dev`, merge to `main` via `push-main`.
- No env changes, no DB migration, no feature flag.

## Open questions

None. The change is fully scoped.
