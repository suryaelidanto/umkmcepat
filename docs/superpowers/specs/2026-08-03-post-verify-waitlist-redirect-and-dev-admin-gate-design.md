# Post-Verify Waitlist Redirect + Dev-Admin Gate Design

> Superseded by `docs/superpowers/specs/2026-08-04-remove-otp-verification-design.md`. The product no longer has a post-OTP verify step; waitlist routing now starts after Google OAuth sign-in.

## Goal

1. After OTP verification succeeds, send the user straight to the next required step when waitlist is on (`/waitlist`), so they do not land on `/` and have to discover “Isi formulir antrean”.
2. Restrict all local skip/reset “dev mode” tools to **development environment + admin email** (`ADMIN_EMAILS`), both in UI and API.

## Problem

### A. Confusing post-OTP path

Current success path in `src/routes/verify.tsx`:

1. OTP OK → success screen “Selamat datang… Mengalihkan…”
2. Hardcoded `router.replace("/")` after 1.5s
3. Homepage yellow banner: “Isi formulir antrean dulu…” → user must click → `/waitlist`

Homepage access for waitlisted users (see `2026-07-30-waitlist-homepage-access-design.md`) is intentional: they may leave `/waitlist` for `/`. That freedom made the **first** post-verify landing wrong — welcome copy implies product access while the real next step is the antrean form.

### B. Dev tools too open

| Surface | UI gate today | API gate today |
|---|---|---|
| `/verify` Skip OTP | `import.meta.env.DEV` only | `NODE_ENV === "development"` only |
| `/waitlist` skip/reset | `isDev && isAdmin` | development only, **no admin** |
| `MainChrome` DEV bar + resets | DEV only | same APIs, **any signed-in user** |
| All four `/api/dev/*` routes | — | development only, **no admin** |

Any signed-in non-admin on a local/dev server can skip OTP and waitlist via API.

## Decisions

### 1. Post-OTP destination

| Effective waitlist status after verify | Destination |
|---|---|
| `"approved"` (gate off, approved entry, or prod admin bypass) | `/` |
| anything else (`null`, missing, fetch failure) | `/waitlist` |

Reuse existing `/api/user/waitlist` semantics via `resolveUserWaitlistStatus` — do **not** re-implement gate rules on the client.

- Waitlist disabled → API returns `status: "approved"` → `/`
- Approved entry → `"approved"` → `/`
- No entry / pending / rejected → non-approved → `/waitlist`
- Admin in **production** → `"approved"` → `/`
- Admin in **development** → treated like a normal user by existing API (so gate flow is testable) → usually `/waitlist` unless they already skipped/approved

**Fail-safe:** if waitlist status cannot be loaded after verify, go to `/waitlist` (prefer one extra form step over a false “you’re in” homepage).

**Unchanged:** users may still leave `/waitlist` for `/` (homepage access design). Product routes stay blocked until approved.

### 2. Implementation shape for redirect (client, lean)

Keep the existing client `setTimeout` + `router.replace` pattern in `verify.tsx`.

1. On OTP (or allowed skip) success: mark verified in React Query cache (as today).
2. `await invalidateWaitlistStatus(queryClient)`.
3. `const status = await fetchWaitlistStatus()` (or read fresh cache after fetch).
4. `const to = postVerifyDestination(status.status)` pure helper.
5. Success copy depends on `to`.
6. `setTimeout(() => router.replace(to), 1500)`.

Pure helper (unit-tested):

```ts
export function postVerifyDestination(
  waitlistStatus: string | null | undefined,
): "/" | "/waitlist" {
  return waitlistStatus === "approved" ? "/" : "/waitlist";
}
```

No verify-API response shape change. No new env vars.

### 3. Success copy (Indonesian)

| Destination | Title (keep) | Body |
|---|---|---|
| `/waitlist` | `Verifikasi berhasil!` | `Lanjut isi formulir antrean…` |
| `/` | `Verifikasi berhasil!` | `Selamat datang di UMKM Cepat. Mengalihkan…` |

### 4. Already-verified hit on `/verify`

Server `requireUnverified` currently redirects verified users to `/`. Align with the same destination rule server-side (waitlist status → `/` or `/waitlist`) so deep links stay consistent.

### 5. Dev tools = development + admin

**Admin definition (unchanged):** email listed in `ADMIN_EMAILS` (comma-separated), via `isAdminEmail()` in `src/lib/waitlist.ts`.

**Both required:**

1. `process.env.NODE_ENV === "development"`
2. Signed-in session email is admin (`isAdminEmail`)

Missing either → no UI, API returns 403 (or 401 if anonymous).

#### Server

Shared helper (e.g. `requireDevAdmin` next to `requireAdmin` in `src/lib/auth-admin.ts` or a tiny `src/lib/dev-admin.ts`):

1. If not development → 403, Indonesian message: endpoint only available in development.
2. Else `requireAdmin()` (401 anonymous / 403 non-admin).

Apply to all four routes:

- `src/routes/api.dev.skip-verification.ts`
- `src/routes/api.dev.reset-verification.ts`
- `src/routes/api.dev.skip-waitlist.ts`
- `src/routes/api.dev.reset-waitlist.ts`

Also call `requireDevAdmin` (or equivalent) inside `devApproveOwnWaitlistEntry` / `devResetOwnWaitlistEntry` **only if** those are ever called outside the routes; today routes own the gate — route-level is enough. Prefer route-level only (YAGNI).

#### Client UI

| Surface | Show when |
|---|---|
| `/verify` Skip button | development **and** admin |
| `MainChrome` orange DEV bar + reset buttons | development **and** admin |
| `/waitlist` skip/reset | already `isDev && isAdmin` — keep; ensure `isDev` means `import.meta.env.DEV` (or shared flag) |

**How client knows admin without exposing `ADMIN_EMAILS` to the browser:**

- Prefer server-derived boolean on an existing signed-in fetch.
- Extend `/api/user/verification` JSON with `canUseDevTools: boolean` (true only when `NODE_ENV === "development"` **and** `isAdminEmail(session.email)`).
- Extend `UserVerification` / `fetchUserVerification` accordingly.
- Guests (401) → no tools.
- Production always `false`.

`/verify` loader may also return `canUseDevTools` for first paint before client query settles; either loader or query is fine as long as the button does not flash for non-admins.

`/waitlist` already has `isAdmin` from its loader — keep using that with `import.meta.env.DEV`.

### 6. Out of scope

- EnergyBoosterModal “Dev Order ID” (hostname `isDev` helper) — leave as-is.
- Redesign of waitlist form or homepage banner.
- Changing prod admin auto-approve / dev admin-as-normal-user semantics in `resolveUserWaitlistStatus`.
- Locking users on `/waitlist` again.

## Error / edge cases

| Case | Behavior |
|---|---|
| Waitlist status fetch fails after OTP | Destination `/waitlist`; optional short error toast is not required |
| User already has pending entry | Still `/waitlist` (status screen / form prefill as today) |
| User rejected | `/waitlist` (reapply path) |
| Gate disabled mid-session | Status `"approved"` → `/` |
| Non-admin calls `/api/dev/*` in development | 403 |
| Anyone calls `/api/dev/*` in production/test | 403 |
| Anonymous calls `/api/dev/*` | 401 |
| Non-admin on localhost | No skip/reset UI; API still 403 |

## Testing

- Unit: `postVerifyDestination` — approved → `/`; null/undefined/other → `/waitlist`
- Unit: `requireDevAdmin` / pure env+email predicate — non-dev, non-admin, ok
- Unit or route-level: verification payload includes `canUseDevTools` only when both conditions hold (mock env + email)
- No requirement for full browser E2E in this change; focused Vitest is enough
- Existing gate tests remain green

## Docs

- This design + implementation plan.
- No PRODUCT.md change unless onboarding funnel copy is documented there (it is not required for this fix).
- `DEV.md` only if it documents skip buttons for any local user — update to “admin + development” if so.

## Deliberate skips

- No server-driven redirect header from OTP verify API
- No new waitlist status values
- No change to homepage banner copy for users who navigate home later
- No Storybook for verify success screen (not a shared component today)
