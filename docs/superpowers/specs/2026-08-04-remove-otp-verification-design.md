# Remove OTP Verification Design

## Status

Planned. This spec supersedes active WhatsApp OTP onboarding behavior from earlier OTP and post-verify specs. Historical specs remain as decision history; this document is the current source of truth for removing OTP from the active product.

## Goal

Remove WhatsApp OTP as an active authentication/onboarding requirement. Google OAuth is sufficient identity verification, and waitlist/admin approval remains the product access gate.

## Problem

OTP is no longer needed for the pilot access model. Keeping it active adds a second authentication funnel:

- `/verify` page and post-verify redirect behavior.
- OTP send/verify API routes.
- OTPSpace provider configuration and production startup requirements.
- OTP-specific user fields and `OtpRequest` rows.
- Dev-only skip/reset verification tooling.
- Client and server gate branches that can redirect signed-in users to `/verify`.
- Docs/setup copy that makes OTP look required.

A feature flag would hide the user-facing step when disabled, but it would keep the same branches, docs, schema, tests, and provider decisions alive. That is worse than removal because every future auth, waitlist, and admin-settings change would still need to support both modes.

## Decision

Remove OTP completely from active code, schema, tracked env examples, tests, and current docs. Do not add an `/admin/settings` feature flag for OTP.

Signed-in Google users are considered identity-verified for routing. Access control remains:

1. Banned users go to `/blocked`.
2. Anonymous users can access public/marketing routes and are blocked by route-specific auth where needed.
3. Signed-in users are checked against waitlist/admin rules.
4. Waitlist-approved users, admins where existing rules allow, or users when the waitlist gate is disabled can use product routes.
5. Signed-in users who are not waitlist-approved go to `/waitlist`, not `/verify`.

## Scope

In:

- Delete the active `/verify` route.
- Delete OTP send/verify API routes.
- Delete OTP library and OTP tests.
- Remove OTPSpace from production provider startup checks.
- Remove `OTP_SPACE_API_KEY` from `.env.example`.
- Remove dev skip/reset verification API routes and UI.
- Remove active verification query/client gate logic that only exists for OTP.
- Drop OTP-specific Prisma schema fields/table through a targeted migration.
- Update active docs and boot instructions that describe OTP as current setup.
- Regenerate route tree after route deletion.
- Keep unrelated `verify` concepts untouched.

Out:

- Do not touch `.env`.
- Do not change Google OAuth configuration.
- Do not change waitlist approval semantics except for removing the prerequisite verification gate.
- Do not change payment/admin transaction verification.
- Do not change project runtime verification scripts/specs.
- Do not redesign homepage, waitlist, or admin UI.
- Do not purge unrelated user/project/payment/waitlist data.

## Data Model

Drop only OTP-specific database pieces:

- `OtpRequest` table/model.
- `User.phone`, if no non-OTP active code still depends on it.
- `User.verifiedAt`.
- `User.otpAttempts`.
- `User.otpLockedUntil`.
- `@@index([verifiedAt])`.

Preserve all non-OTP data:

- `User.id`, `User.email`, `User.emailVerified`, `User.name`, `User.image`, `User.createdAt`, `User.bannedAt`.
- Auth tables: `Account`, `Session`, `RefreshToken`.
- Product data: projects, waitlist entries, credits, payments, support tickets, assets, build handoffs, generated artifacts.

The migration must use explicit `DROP TABLE "OtpRequest"` and `ALTER TABLE "User" DROP COLUMN ...` statements only for the OTP-specific fields. It must not truncate, delete from, or drop any non-OTP table.

## Routing And Access Gates

### Server Gate

`checkRouteGates(pathname)` should no longer call `isUserVerified()` or redirect to `/verify`.

Expected order:

1. Determine whether the path bypasses the waitlist gate.
2. Load auth state.
3. Redirect banned users to `/blocked`, and allow `/blocked` for banned users.
4. Allow anonymous users through the global gate.
5. For signed-in non-banned users, apply waitlist rules unless the path bypasses waitlist.
6. Redirect non-approved signed-in users to `/waitlist`.
7. Return `{ ok: true }` otherwise.

### Client Chrome

`MainChrome` should no longer fetch user verification status, block on verification loading, or redirect to `/verify`.

For signed-in users, waitlist status can be loaded directly. If the waitlist query returns a non-approved status on a non-bypass route, redirect to `/waitlist` as before.

Development UI should keep waitlist dev tools that are still relevant, but remove verification reset/skip controls.

### Removed Routes

Remove these active routes:

- `src/routes/verify.tsx`
- `src/routes/api.auth.otp.send.ts`
- `src/routes/api.auth.otp.verify.ts`
- `src/routes/api.dev.skip-verification.ts`
- `src/routes/api.dev.reset-verification.ts`

Regenerate `src/routeTree.gen.ts` through the project route-generation command (`bun run verify` also regenerates route tree, but implementation should use the repository's focused route-tree command if available before the full gate).

## Provider And Env Behavior

`OTP_SPACE_API_KEY` is no longer an active provider configuration. Remove it from:

- `.env.example`
- production provider startup checks
- provider startup tests
- active docs/setup references

Do not modify `.env`.

`RESEND_API_KEY` and other unrelated provider checks remain unchanged.

## Docs Behavior

Active setup docs should not instruct new agents or developers to configure OTP. Update:

- `AGENTS.md` key modules list.
- `DEV.md` provider/setup/gate text.
- `.env.example` grouping so there is no OTP section.
- Any active docs that describe current auth/setup behavior as Google OAuth + OTP.

Historical `docs/superpowers/specs/*` and `docs/superpowers/plans/*` may keep OTP references when they are clearly past decision records. If a historical document is likely to be mistaken for current setup, add a supersession note rather than rewriting the entire history.

## Search Boundary

Removal search should distinguish three categories:

- Remove active OTP references: `otp`, `OTP`, `OTPSpace`, `OTP_SPACE_API_KEY`, WhatsApp verification copy, `/api/auth/otp/*`, `/verify` as auth onboarding.
- Keep unrelated verify references: payment transaction verify route, webhook signature verification, project runtime verification scripts/specs, generic testing words like “verify output”.
- Preserve historical references where appropriate: old specs/plans that are explicitly historical, unless they cause current setup drift.

## Error And Edge Cases

| Case | Behavior |
| --- | --- |
| Existing user had `verifiedAt = null` | User is no longer blocked by verification; waitlist gate decides access. |
| Existing user had OTP phone | Phone is dropped only if confirmed OTP-only; user OAuth identity stays intact. |
| Existing deep link to `/verify` | Route is gone; normal not-found behavior applies unless a generic route fallback exists. |
| Non-approved signed-in user opens product route | Redirect to `/waitlist`. |
| Approved signed-in user opens product route | Allowed. |
| Waitlist disabled | Signed-in user is approved-equivalent via existing waitlist resolver. |
| Banned signed-in user | Still redirected to `/blocked`; banned gate remains first. |
| Production missing `OTP_SPACE_API_KEY` | No failure; key is irrelevant. |
| Production missing unrelated required key | Existing failure behavior remains. |

## Testing

Minimum focused verification before full `bun run check`:

- Server gate tests prove signed-in non-approved users go to `/waitlist`, not `/verify`.
- Server gate tests prove banned users still short-circuit before waitlist checks.
- Client gate/MainChrome tests, if present, prove no `/verify` redirect remains and waitlist redirect still works.
- Provider startup tests prove `OTP_SPACE_API_KEY` is no longer required in production while `RESEND_API_KEY` still is.
- Prisma migration inspection proves only OTP-specific table/columns/index are dropped.
- Search proves active code/env/docs do not retain OTP onboarding/provider references.

Final gate:

```bash
bun run check
```

Do not run `bun run build` unless later implementation touches build/deployment behavior beyond the normal route tree and schema changes.

## Non-Goals

- No OTP admin feature flag.
- No dormant OTP UI.
- No alternate phone-verification provider.
- No automatic migration of phone numbers into another profile field.
- No changes to OAuth secrets or `.env`.

## Rationale

Removing OTP is the cleanest path because the product already has a simpler trust model: Google OAuth identifies the user, and waitlist/admin approval controls access. A disabled feature flag would still require long-term maintenance of a complex authentication branch that the product no longer wants to use. If OTP is needed again, Git history and the older specs provide enough context to reintroduce it intentionally with a fresh design.
