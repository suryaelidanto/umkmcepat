# Waitlist Admin UI + Toggle — Design

**Date:** 2026-07-25
**Topic:** 3 of the eight-topic roadmap (see `umkmcepat-eight-topic-roadmap` memory)
**Status:** Design approved; pending plan + implementation.

## Goal

Add the missing admin UI so a maintainer can review, approve, and decline waitlist submissions from a simple dashboard; make the waitlist on/off an explicit `WAITLIST_ENABLED` env toggle instead of the current implicit prod-gates/dev-bypasses behavior; and let a rejected user return to `/waitlist` to edit + resend their last submission rather than re-typing it. The backend stays strict either way.

## Why

The waitlist backend is already complete (`WaitlistEntry` table, `submitWaitlist` idempotent upsert that resets `rejected`→`pending` on re-submit, `listPendingWaitlist`, `approveWaitlistEntry`, `rejectWaitlistEntry`, `requireAdmin()` guard, `linkApprovedWaitlistOnSignup`, and the gating in `MainChrome.tsx`). But there is **no admin UI** — only the `/api/admin/waitlist` API — so there is nowhere to actually click "approve/decline." The on/off is also implicit (prod gates anonymous users without an entry; dev treats `null` as approved), which is hard to reason about. This spec fills the UI + the explicit toggle + the pre-fill-on-rejection UX.

## Decisions (locked during brainstorming)

1. **Admin role = keep `ADMIN_EMAILS` env-allowlist.** No DB `role` column. `requireAdmin()` (`src/lib/auth-admin.ts`) already works and is deliberately documented "no Role model, no migration." A single-maintainer pilot doesn't need RBAC machinery; if multiple admins/orgs appear later, add the column then (YAGNI now).
2. **`WAITLIST_ENABLED` env toggle**. Set `WAITLIST_ENABLED="false"` in local dev (so the dev-bypass stays) and `"true"` in prod. Waitlist is a business mode (onboarding requires approval), so it belongs in env config, not a code flag. Backend enforcement stays strict either way: `requireAdmin()` + status checks are unchanged; `WAITLIST_ENABLED=false` only makes the onboarding gate pass-through (a signed-in user without an entry is not redirected to `/waitlist`). When `true`, the gate behaves as today. **Code default when the var is unset = `true`** (fail-safe: over-gate rather than accidentally let everyone through). The prod/dev difference is the env *value* you set, not a `NODE_ENV` branch in code.
3. **Declined → refill = pre-fill last submission + resend.** The backend already supports re-submission (`submitWaitlist` upsert resets `rejected`→`pending`). The gap is UX: a rejected user returns to `/waitlist` and the form is pre-filled with their last entry (business name, phone, story, image thumbnail). They edit + resend. No new backend flow — a new GET returns the signed-in user's own entry. The `rejectionReason` stays admin-only (not surfaced to the user — kinder, and the user knows what to fix from context).
4. **Backend stays strict.** `requireAdmin()`, status transitions, and `linkApprovedWaitlistOnSignup` are unchanged. Only the gate's pass-through behavior changes with the toggle.

## Architecture

### `WAITLIST_ENABLED` env + gate logic

New env var `WAITLIST_ENABLED` (boolean string, default `"true"` in prod, `"false"` in dev). Add to `.env`/`.env.example` (REQUIRED section — it changes onboarding behavior). One-liner comment, 1:1 structure.

The gate in `src/components/common/MainChrome.tsx` (lines ~46-94): today it queries `/api/user/waitlist` and, in non-production, treats `null` (no entry) as approved; in production, gates `null` to `/waitlist`. Replace the implicit prod/dev branch with an explicit toggle:

- `WAITLIST_ENABLED=false` → gate is pass-through (signed-in user is never redirected to `/waitlist`), regardless of environment.
- `WAITLIST_ENABLED=true` → gate behaves as today: a user whose entry status is not `approved` is redirected to `/waitlist`.

The toggle is read server-side (in the `/api/user/waitlist` handler or a config check) so the client gate just honors the response. `WAITLIST_ENABLED` MUST be fail-safe: if unset, default to `true` (gate on — safer to over-gate than to accidentally let everyone through).

### Admin dashboard page

New route `src/routes/_main.admin.waitlist.tsx` (or `_main.admin.tsx` — match the existing `_main.*` convention; check the route tree). UI:

- Server-rendered `requireAdmin()` check → non-admins get `403` (reuse the existing `requireAdmin()` helper, no new auth logic).
- Fetches `GET /api/admin/waitlist` (existing) → lists `pending` entries.
- Each entry shows: business name, phone, story (truncated), business-type, image thumbnail (if `imageRef`), submitted-at. Approve button + Decline button (decline opens a small reason input — the `rejectionReason` column already exists).
- Approve/Decline call `POST /api/admin/waitlist` (existing) with `{entryId, action, reason?}`. Optimistic UI: remove the row on success; toast on error.
- Empty state: "Belum ada pendaftar menunggu." (honest empty, no fabrication).
- Mobile-native: the dashboard is a stacked list (cards), bottom-sticky approve/decline actions, `h-dvh`, safe-area. (This is the first admin surface and the first place the "mobile everywhere" bar from topic 4 applies — build it mobile-first.)

### Pre-fill on rejection

- New endpoint `GET /api/user/waitlist/own` (or extend `/api/user/waitlist` to return the user's own entry when signed in) → returns `{businessName, phone, businessType, story, imageRef, status}` for the signed-in user's `WaitlistEntry` (matched by email), or `null`.
- The waitlist page (`src/routes/_main.waitlist.tsx`) fetches this on mount; if present, pre-fills `businessName`/`phone`/`story` + shows the existing image thumbnail with a "Ganti gambar" affordance. A re-submit hits the same `POST /api/waitlist` → the existing upsert updates + resets to pending.
- The image is served via the existing `object-storage` path (waitlist evidence is local + private today; no R2). Keep it admin-only-readable as today.

### Backend changes (minimal)

- Add `WAITLIST_ENABLED` read + the gate pass-through branch (server-side). ~10 lines.
- Add `GET /api/user/waitlist/own` (or extend the existing one) returning the user's own entry for pre-fill. Reuses `prisma.waitlistEntry.findUnique({where:{email}})` — no new domain logic.
- No changes to `submitWaitlist`, `approveWaitlistEntry`, `rejectWaitlistEntry`, `requireAdmin`, or `linkApprovedWaitlistOnSignup`.

## Data flow

**Admin review:**
1. Maintainer (email in `ADMIN_EMAILS`) signs in → visits `/admin/waitlist`.
2. Page server-checks `requireAdmin()` → 403 if not admin.
3. Client fetches `GET /api/admin/waitlist` → renders pending entries.
4. Approve → `POST /api/admin/waitlist {entryId, action:"approve"}` → `approveWaitlistEntry` flips status to `approved` + sets `reviewerId` + `reviewedAt`. Row leaves the pending list.
5. Decline → reason input → `POST /api/admin/waitlist {entryId, action:"reject", reason}` → `rejectWaitlistEntry` flips to `rejected` + stores `rejectionReason`.

**Rejected user refills:**
1. User signs in (Google OAuth) → `MainChrome` gate → `/api/user/waitlist` returns their `rejected` status → redirected to `/waitlist`.
2. `/waitlist` fetches `GET /api/user/waitlist/own` → pre-fills the form with their last submission.
3. User edits + submits → `POST /api/waitlist` → `submitWaitlist` upsert resets status to `pending`, updates the fields.
4. Entry reappears in the admin pending list.

**Toggle off:**
1. `WAITLIST_ENABLED=false` → gate pass-through → signed-in user proceeds past `/waitlist` regardless of entry status.
2. The public `POST /api/waitlist` still works (submissions are still accepted/stored) — the toggle only controls the onboarding gate, not submission. (If you want submission disabled too, that's a separate decision — default: keep accepting submissions even when the gate is off, so the waitlist can accumulate for a later launch.)

## Error handling

- `requireAdmin()` 403 for non-admins — unchanged, no new surface.
- Approve/decline network failure → toast + keep the row (retryable).
- Pre-fill fetch failure → form renders blank (graceful degradation; the user can still submit from scratch).
- `WAITLIST_ENABLED` unset → defaults `true` (gate on, fail-safe).

## Testing (TDD)

1. **Unit — toggle parsing:** `WAITLIST_ENABLED` true/false/unset/invalid → correct gate decision; unset → `true` (fail-safe).
2. **Unit — own-entry endpoint:** signed-in user with an entry → returns their fields; no entry → `null`; anonymous → `401`.
3. **Unit — admin gate:** non-admin → 403; admin (email in `ADMIN_EMAILS`) → proceeds.
4. **Component — admin dashboard:** renders pending list from the API mock; approve removes the row; decline-with-reason removes the row; empty state shows honestly.
5. **Component — waitlist pre-fill:** with an own-entry, the form is pre-filled; without, it's blank.
6. **Integration (env-gated):** submit → admin approve → user's gate passes; submit → admin reject → user sees pre-filled form → resubmit → status back to pending.

## Out of scope

- A DB `role` column / RBAC (env-allowlist stays).
- Surfacing `rejectionReason` to the user (admin-only).
- Moving waitlist evidence to R2 (stays local; private).
- Disabling submission when the toggle is off (default: keep accepting).
- The non-waitlist admin surfaces (this is the only admin page for now).

## Open questions for implementation

- Confirm the route-file convention for an admin page under the `_main` layout (`_main.admin.tsx` vs `_main.admin.waitlist.tsx`) by checking the existing route tree.
- Confirm the toast mechanism used elsewhere in the workspace for the admin dashboard's optimistic UI.
