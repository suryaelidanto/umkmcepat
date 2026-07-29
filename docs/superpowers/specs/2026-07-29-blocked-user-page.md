# Blocked-user page + sign-in ban enforcement

Status: draft
Date: 2026-07-29
Owner: TBD
Related: `User.bannedAt` column, `_main.admin.users.tsx` ban UI, `auth()` helper in `src/lib/auth.ts`

## Context

Admin users can ban an account via `/admin/users` (sets `User.bannedAt`). Today a banned user is silently treated as anonymous because `src/lib/auth.ts:93-101` returns `null` whenever `bannedAt` is set, and every gated route treats `null` as "not signed in." The result:

- Banned user trying to load `/projects/abc` → bounced to `/` with no explanation.
- Banned user trying to verify OTP on `/verify` → bounced to `/`.
- Banned user trying to read their admin tickets → bounced to `/`.
- A banned user can sign out, sign back in, and complete Google OAuth successfully — Auth.js mints a fresh JWT because there is no `signIn` callback rejecting banned emails. The ban only takes effect on the next gated request.
- No client-side attack (Tampermonkey, devtools, popup-hide) can bypass the server-side gate, because the loader never returns the app payload for a banned user. The only client-side gap is UX: the user has no idea why they were bounced.

Goal: banned users see a clear `/blocked` page that explains they are blocked and how to contact support, with one logout button. The page is rendered by the server. A fresh sign-in by a banned user is rejected at OAuth completion, not lazily on the next gated request.

## Decisions

- **Route name**: `/blocked` (English URL, Indonesian page copy). Matches the convention of English route paths used elsewhere (`/verify`, `/waitlist`, `/admin`, `/support`).
- **Page copy (Indonesian)**: "Akun Anda diblokir. Hubungi admin di hello@umkmcepat.com untuk info lebih lanjut." Matches the tone of the existing OTP lockout copy in `src/lib/otp.ts:53`.
- **One button**: "Keluar" → calls existing `signOut({ callbackUrl: "/" })` from `src/lib/auth-client.tsx:168-187`, then lands on `/`.
- **Auth state model**: keep `auth()` returning `Session | null` as-is (backward compat with ~30 existing call sites). Add a new `getAuthState()` that returns `{ session: Session | null, banned: boolean }`. Banned = "valid session cookie but `User.bannedAt IS NOT NULL`." This is the only new concept; `auth() === null` no longer has to mean both "guest" and "banned."
- **Defense-in-depth helper**: add `requireNotBanned(session)` in `src/lib/auth.ts` for the 3 routes that read `User` rows directly without a follow-up ownership check (`api.profile.ts`, `api.user.credits.ts`, `api.user.energy-ledger.ts`). Throws redirect to `/blocked` if banned. Cheap, future-proofs against a refactor that drops the `auth()` gate.
- **Sign-in callback**: add `signIn` callback in `auth-config.ts:33` that queries `User.bannedAt` and returns `false` if set. Auth.js will then refuse to issue a JWT for a banned user, and the OAuth callback will fail with the standard Auth.js error page.
- **Drive-by fix**: add `/verify` to `isPublicRoute` in `_main.tsx:15-18`. Without it, a verified-approved user navigating to `/verify` would be redirected to `/waitlist` (logic bug, not a security hole — `requireUnverified` catches them but they end up on `/` instead of seeing the form).
- **Caching**: `/blocked` response sets `Cache-Control: no-store` so a banned user cannot see a stale cached version of the app if their browser was caching page responses.

## Non-goals

- **Ban by email** — current `User.bannedAt` is per user row. Banning by email would require either a new `BannedEmail` table or an email-keyed check at sign-in. Out of scope; spec for later if needed.
- **IP/UA binding of JWT** — the DB re-check in `auth()` already defeats post-ban token replay. Pre-ban token theft is out of scope.
- **Banning admins** — already handled transitively; `requireAdmin()` calls `auth()` which returns null for banned users regardless of `ADMIN_EMAILS` env.
- **Closing the preview-asset-token bypass** (`src/routes/api.projects.$id.assets.$.ts:84-91`) — accepted as known behavior. A banned user can keep loading their own generated preview assets for up to 15 minutes after ban, scoped to their own deployment, with no cross-user data leak. Adding `auth()` inside the token branch would close the iframe-loading race but provides no security benefit (it's the user's own content, served from a sandboxed runtime). Document in PR description, do not fix in this change.
- **Audit log of ban events** — out of scope; admin can already see who banned whom via the admin users list.
- **Email notification to banned user** — out of scope; admin can communicate manually.
- **Migrating `auth()` to return `{ session, banned }`** — kept backward compat to avoid a 30-call-site refactor. New `getAuthState()` is the right place for the new concept.

## Acceptance criteria

1. A banned user visiting any `_main.*` page (other than `/blocked` itself) is redirected server-side (HTTP 302) to `/blocked`.
2. A guest (no session) visiting `/blocked` is redirected server-side to `/`.
3. A signed-in non-banned user visiting `/blocked` is redirected server-side to `/`.
4. `/blocked` page renders the message and one "Keluar" button. Clicking it calls `signOut({ callbackUrl: "/" })` and lands the user on `/` as a guest.
5. `/blocked` response includes `Cache-Control: no-store`.
6. A banned user completing Google sign-in is allowed to sign in (the gate handles the block, not the signIn callback). After sign-in, the gate redirects them to `/blocked` via the existing flow. They see the message, can log out manually, or contact admin.
7. The 3 routes that do direct `prisma.user.findUnique` keyed on `session.user.id` (`api.profile.ts`, `api.user.credits.ts`, `api.user.energy-ledger.ts`) reject banned users via `requireNotBanned()` and redirect to `/blocked`. (Defense-in-depth; current `auth() === null` path already blocks them, this guards against future refactors.)
8. All existing tests still pass. New tests cover: `getAuthState()`, `requireNotBanned()`, `signIn` callback (ban rejection), `/blocked` page (4 cases), defense-in-depth on the 3 routes.
9. `bun run check` passes (format, lint, typecheck, affected tests, Knip). No new dependencies.

## File map (full diff in plan)

**New files:**
- `docs/superpowers/specs/2026-07-29-blocked-user-page.md` (this file)
- `docs/superpowers/plans/2026-07-29-blocked-user-page.md`
- `src/routes/_main.blocked.tsx` — `/blocked` page (server loader + UI + logout button + no-store header)
- `src/routes/_main.blocked.test.ts` — 4 cases
- `src/lib/auth-config.test.ts` — `signIn` callback ban rejection

**Modified files:**
- `src/lib/auth.ts` — add `getAuthState()` and `requireNotBanned()`
- `src/lib/auth.ts` test (`src/lib/auth.test.ts`) — cases for the two new helpers
- `src/lib/auth-config.ts` — add `signIn` callback (and import prisma)
- `src/routes/_main.tsx` — add banned branch in `checkRouteGates`; add `/verify` to `isPublicRoute`
- `src/routes/_main.profile.tsx` — explicit banned check
- `src/routes/api.profile.ts` — `requireNotBanned()` call
- `src/routes/api.user.credits.ts` — `requireNotBanned()` call
- `src/routes/api.user.energy-ledger.ts` — `requireNotBanned()` call

## Out of scope (documented known behavior)

- Preview-asset-token allows a banned user to keep loading their own generated preview assets for ≤15 min post-ban (`src/routes/api.projects.$id.assets.$.ts:84-91`). The token is bound to `(projectId, deploymentId)`, served from a sandboxed runtime, and contains only the user's own generated content. No cross-user data leak. Documented in the PR description; not fixed in this change.
