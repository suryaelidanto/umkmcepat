# Remove OTP Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove WhatsApp OTP from the active product so Google OAuth plus waitlist/admin approval is the complete access model.

**Architecture:** Delete the OTP route/API/provider/schema branch instead of hiding it behind a feature flag. Server and client gates should route signed-in users directly through waitlist rules, while a targeted Prisma migration drops only OTP-specific data structures.

**Tech Stack:** TanStack Start routes, TanStack Router route tree generation, React Query, Prisma/PostgreSQL, Vitest, Bun.

## Global Constraints

- Do not touch `.env`.
- Remove OTP completely from active code, schema, tracked env examples, tests, and current docs.
- Do not add an `/admin/settings` feature flag for OTP.
- Google OAuth is sufficient identity verification.
- Waitlist/admin approval remains the product access gate.
- Preserve unrelated user, auth, project, waitlist, credit, payment, support, asset, and generated-artifact data.
- Keep unrelated `verify` concepts untouched: payment/admin transaction verification, webhook signature verification, project runtime verification, and generic test verification wording.
- User-facing product UI copy stays Indonesian; developer-facing docs/code/logs/errors stay English.
- No new dependencies.
- Use Bun commands only.
- Before handoff after implementation, run `bun run check`.

---

## File Structure

Delete active OTP files:

- `src/routes/verify.tsx` — OTP onboarding page.
- `src/routes/api.auth.otp.send.ts` — OTP send endpoint.
- `src/routes/api.auth.otp.verify.ts` — OTP verify endpoint.
- `src/lib/otp.ts` — OTP generation, provider adapter, verification logic.
- `src/lib/otp.test.ts` — OTP unit tests.
- `src/routes/api.dev.skip-verification.ts` — dev OTP skip endpoint.
- `src/routes/api.dev.reset-verification.ts` — dev OTP reset endpoint.
- `src/lib/post-verify-destination.ts` and `src/lib/post-verify-destination.test.ts` — post-OTP redirect helper and tests.
- `src/lib/main-chrome-gate.ts` and `src/lib/main-chrome-gate.test.ts` — verification redirect/loading helper and tests.

Modify gate/client/provider files:

- `src/server/loaders/check-route-gates.ts` — remove verification check and `/verify` redirect.
- `src/server/loaders/check-route-gates.test.ts` — update server gate expectations.
- `src/components/common/MainChrome.tsx` — remove verification query, `/verify` redirect, verification reset UI.
- `src/lib/query-client.ts` — remove verification query key/type/fetch helper.
- `src/lib/query-client.test.ts` — remove `fetchUserVerification` tests and guest-safe `/api/user/verification` unauthorized handling case.
- `src/routes/api.user.verification.ts` — delete verification status endpoint.
- `src/lib/provider-startup-check.ts` — remove `OTP_SPACE_API_KEY` from production required providers.
- `src/lib/provider-startup-check.test.ts` — update tests.
- `src/routeTree.gen.ts` — regenerate, never hand-edit.

Modify schema/docs:

- `prisma/schema.prisma` — remove OTP-specific user fields/index and `OtpRequest` model.
- `prisma/migrations/<timestamp>_remove_otp_verification/migration.sql` — drop only OTP table/columns/index.
- `.env.example` — remove OTP section and `OTP_SPACE_API_KEY`.
- `AGENTS.md` — remove OTP key module reference.
- `DEV.md` — remove active OTP setup/provider/gate references.
- Historical docs under `docs/superpowers/specs/*` and `docs/superpowers/plans/*` — leave as history unless a line presents OTP as current setup; add a supersession note only where needed.

---

### Task 1: Server Gate Removes Verification Requirement

**Files:**

- Modify: `src/server/loaders/check-route-gates.ts`
- Modify: `src/server/loaders/check-route-gates.test.ts`

**Interfaces:**

- Consumes: `getAuthState()`, `isAdminEmail(email)`, `isWaitlistApproved(email)`, `isWaitlistEnabled()`, `isWaitlistGateBypassPath(pathname)`, `resolveUserWaitlistStatus(input)`
- Produces: `checkRouteGates(pathname: string): Promise<{ ok: true }>` with no OTP verification dependency

- [ ] **Step 1: Write failing server gate tests**

Update `src/server/loaders/check-route-gates.test.ts` so the mocked `isUserVerified` import is removed. Add or update these cases:

```ts
it("redirects signed-in non-approved users to waitlist without verification", async () => {
  getAuthStateMock.mockResolvedValue({
    session: { user: { id: "user_1", email: "owner@example.com" } },
    banned: false,
  });
  isWaitlistEnabledMock.mockResolvedValue(true);
  isWaitlistApprovedMock.mockResolvedValue(null);

  await expect(checkRouteGates("/projects/new")).rejects.toMatchObject({
    options: { to: "/waitlist" },
  });
});

it("allows signed-in approved users through product routes", async () => {
  getAuthStateMock.mockResolvedValue({
    session: { user: { id: "user_1", email: "owner@example.com" } },
    banned: false,
  });
  isWaitlistEnabledMock.mockResolvedValue(true);
  isWaitlistApprovedMock.mockResolvedValue(true);

  await expect(checkRouteGates("/projects/new")).resolves.toEqual({ ok: true });
});

it("does not run waitlist checks for banned users on blocked page", async () => {
  getAuthStateMock.mockResolvedValue({
    session: { user: { id: "user_1", email: "owner@example.com" } },
    banned: true,
  });

  await expect(checkRouteGates("/blocked")).resolves.toEqual({ ok: true });
  expect(isWaitlistEnabledMock).not.toHaveBeenCalled();
  expect(isWaitlistApprovedMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/server/loaders/check-route-gates.test.ts`

Expected: FAIL because `checkRouteGates` still imports/calls `isUserVerified` and redirects unverified users to `/verify`.

- [ ] **Step 3: Remove verification from server gate**

In `src/server/loaders/check-route-gates.ts`, delete the `isUserVerified` import and remove this block:

```ts
const verified = await isUserVerified(session.user.id);
if (!verified) {
  throw redirect({ to: "/verify" });
}
```

The signed-in path should flow directly from auth/banned checks into existing waitlist logic:

```ts
if (!waitlistBypass) {
  const email = session.user.email ?? null;
  const isAdmin = email ? isAdminEmail(email) : false;
  const waitlistEnabled = await isWaitlistEnabled();
  const isApproved = email ? await isWaitlistApproved(email) : null;

  const resolved = resolveUserWaitlistStatus({
    email,
    isAdmin,
    isApproved,
    waitlistEnabled,
  });

  if (resolved.status !== "approved") {
    throw redirect({ to: "/waitlist" });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/server/loaders/check-route-gates.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Only if the user explicitly asks for commits during execution, run:

```bash
git add src/server/loaders/check-route-gates.ts src/server/loaders/check-route-gates.test.ts
git commit -m "feat(auth): remove otp route gate"
```

---

### Task 2: Client Chrome Removes Verification Query And Redirect

**Files:**

- Modify: `src/components/common/MainChrome.tsx`
- Modify: `src/lib/query-client.ts`
- Modify: `src/lib/query-client.test.ts`
- Delete: `src/lib/main-chrome-gate.ts`
- Delete: `src/lib/main-chrome-gate.test.ts`

**Interfaces:**

- Consumes: `useSession()`, `fetchWaitlistStatus()`, `waitlistPendingPollInterval(data)`, `isWaitlistGateBypassPath(pathname)`
- Produces: `MainChrome({ children })` with no `/verify` redirect or verification loading shell

- [ ] **Step 1: Write failing client/cache tests**

Delete `src/lib/main-chrome-gate.test.ts` with the helper in Step 5. Update `src/lib/query-client.test.ts` by deleting the `fetchUserVerification` describe block and removing `/api/user/verification` from the guest-safe unauthorized handling test. Keep the existing waitlist helper coverage; if the file loses all waitlist helper coverage, add this assertion:

```ts
it("polls waitlist only for pending own entries", () => {
  expect(
    waitlistPendingPollInterval({ status: "pending", own: { status: "pending" } }),
  ).toBe(WAITLIST_PENDING_POLL_MS);
  expect(waitlistPendingPollInterval({ status: "approved" })).toBe(false);
});
```

- [ ] **Step 2: Run affected tests to verify failure/state**

Run: `bun run test src/lib/query-client.test.ts`

Expected: PASS after deleting obsolete `fetchUserVerification` tests, or FAIL if removed exports are still referenced by tests.

- [ ] **Step 3: Simplify MainChrome**

In `src/components/common/MainChrome.tsx`:

Remove imports:

```ts
import {
  shouldBlockMainChromeShell,
  shouldRedirectToVerify,
} from "@/lib/main-chrome-gate";
import {
  fetchJson,
  fetchUserVerification,
  fetchWaitlistStatus,
  GATE_QUERY_OPTIONS,
  invalidateWaitlistStatus,
  queryKeys,
  waitlistPendingPollInterval,
} from "@/lib/query-client";
```

Replace with only needed imports:

```ts
import {
  fetchJson,
  fetchWaitlistStatus,
  GATE_QUERY_OPTIONS,
  invalidateWaitlistStatus,
  queryKeys,
  waitlistPendingPollInterval,
} from "@/lib/query-client";
```

Delete `isVerifyPage`, `verificationQuery`, `isVerified`, `canUseDevTools`, and `devResetVerification`.

Enable waitlist query for authenticated users outside `/waitlist`:

```ts
const waitlistQuery = useQuery({
  queryKey: queryKeys.waitlistStatus,
  queryFn: fetchWaitlistStatus,
  enabled: sessionStatus === "authenticated" && !isWaitlistPage,
  ...GATE_QUERY_OPTIONS,
  refetchInterval: (query) => waitlistPendingPollInterval(query.state.data),
});
```

Update redirect effect to only check waitlist:

```ts
useEffect(() => {
  if (isWaitlistPage) {
    return;
  }

  if (
    sessionStatus === "authenticated" &&
    waitlistQuery.isSuccess &&
    waitlistQuery.data.status !== "approved" &&
    !isWaitlistGateBypassPath(pathname)
  ) {
    router.replace("/waitlist");
  }
}, [
  isWaitlistPage,
  pathname,
  router,
  sessionStatus,
  waitlistQuery.data,
  waitlistQuery.isSuccess,
]);
```

Change the full-page bypass:

```ts
if (isWaitlistPage) {
  return <>{children}</>;
}
```

Delete the verification loading shell block that calls `shouldBlockMainChromeShell`.

Keep the existing orange dev bar only for remaining waitlist reset controls. Render it when there is an own waitlist entry; remove all verification reset text and mutation wiring. The remaining button copy stays `Reset Antrian (Waitlist)` / `Mereset Antrian...`.

- [ ] **Step 4: Remove verification query helper if unused**

In `src/lib/query-client.ts`, delete:

```ts
verification: ["verification"] as const,
export type UserVerification = { ... };
export async function fetchUserVerification(): Promise<UserVerification> { ... }
```

Also remove `/api/user/verification` from `handleUnauthorizedError` guest-safe endpoints:

```ts
if (
  urlString.includes("/api/user/credits") ||
  urlString.includes("/api/support/unread-count")
) {
  return;
}
```

- [ ] **Step 5: Delete main chrome gate helper**

Run: `rg "main-chrome-gate|shouldRedirectToVerify|shouldBlockMainChromeShell" src`

Expected before deletion: only `MainChrome` and tests reference it. Delete `src/lib/main-chrome-gate.ts` and `src/lib/main-chrome-gate.test.ts`.

- [ ] **Step 6: Run tests**

Run: `bun run test src/lib/query-client.test.ts`

Expected: PASS.

Run: `rg "main-chrome-gate|shouldRedirectToVerify|shouldBlockMainChromeShell" src`

Expected: no matches.

- [ ] **Step 7: Commit**

Only if the user explicitly asks for commits during execution, run:

```bash
git add src/components/common/MainChrome.tsx src/lib/query-client.ts src/lib/query-client.test.ts
git add -u src/lib/main-chrome-gate.ts src/lib/main-chrome-gate.test.ts
git commit -m "feat(auth): remove client otp gate"
```

---

### Task 3: Delete OTP Routes, Library, Dev Verification Tools, And Route Tree Entries

**Files:**

- Delete: `src/routes/verify.tsx`
- Delete: `src/routes/api.auth.otp.send.ts`
- Delete: `src/routes/api.auth.otp.verify.ts`
- Delete: `src/lib/otp.ts`
- Delete: `src/lib/otp.test.ts`
- Delete: `src/routes/api.dev.skip-verification.ts`
- Delete: `src/routes/api.dev.reset-verification.ts`
- Delete: `src/routes/api.user.verification.ts`
- Delete: `src/lib/post-verify-destination.ts`
- Delete: `src/lib/post-verify-destination.test.ts`
- Modify: `src/routeTree.gen.ts` through regeneration only

**Interfaces:**

- Consumes: Task 1 and Task 2 removed active consumers.
- Produces: no active `/verify`, `/api/auth/otp/send`, `/api/auth/otp/verify`, `/api/dev/skip-verification`, `/api/dev/reset-verification`, or `/api/user/verification` routes.

- [ ] **Step 1: Confirm consumers are gone**

Run: `rg "@/lib/otp|createOtpRequest|sendOtpViaSms|verifyOtp|postVerifyDestination|fetchUserVerification|api/user/verification|skip-verification|reset-verification|/api/auth/otp|/verify" src`

Expected: only the files listed for deletion and `src/routeTree.gen.ts` should match. Unrelated `/api/admin/transactions/$orderId/verify` matches are allowed and must not be changed.

- [ ] **Step 2: Delete OTP files**

Remove the listed files with `rm` or `apply_patch` delete operations. Do not delete payment transaction verify routes.

- [ ] **Step 3: Regenerate route tree**

Run the focused route-tree generation command:

```bash
bun run routes:generate
```

Expected: route tree no longer imports or declares the deleted routes.

- [ ] **Step 4: Search route tree for deleted routes**

Run: `rg "api/auth/otp|skip-verification|reset-verification|api/user/verification|fullPath: '/verify'|path: '/verify'" src/routeTree.gen.ts src/routes src/lib`

Expected: no matches for deleted auth OTP/verification routes. Matches for `/api/admin/transactions/$orderId/verify` are allowed.

- [ ] **Step 5: Run focused tests**

Run: `bun run test src/server/loaders/check-route-gates.test.ts src/lib/query-client.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Only if the user explicitly asks for commits during execution, run:

```bash
git add -u src/routes/verify.tsx src/routes/api.auth.otp.send.ts src/routes/api.auth.otp.verify.ts src/lib/otp.ts src/lib/otp.test.ts src/routes/api.dev.skip-verification.ts src/routes/api.dev.reset-verification.ts src/routes/api.user.verification.ts src/lib/post-verify-destination.ts src/lib/post-verify-destination.test.ts src/routeTree.gen.ts
git commit -m "feat(auth): delete otp routes"
```

---

### Task 4: Remove OTPSpace Provider Requirement

**Files:**

- Modify: `src/lib/provider-startup-check.ts`
- Modify: `src/lib/provider-startup-check.test.ts`

**Interfaces:**

- Consumes: `process.env.NODE_ENV`, provider env vars
- Produces: `assertProvidersForProduction(): void` requiring only active production providers

- [ ] **Step 1: Write failing provider tests**

Update `src/lib/provider-startup-check.test.ts` with these expectations:

```ts
it("production does not require OTP_SPACE_API_KEY", () => {
  process.env.NODE_ENV = "production";
  delete process.env.OTP_SPACE_API_KEY;
  process.env.RESEND_API_KEY = "re_x";

  expect(() => assertProvidersForProduction()).not.toThrow();
});

it("production still requires RESEND_API_KEY", () => {
  process.env.NODE_ENV = "production";
  delete process.env.RESEND_API_KEY;

  expect(() => assertProvidersForProduction()).toThrow(/RESEND_API_KEY/);
});
```

Remove old tests that expect missing OTP to throw.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/provider-startup-check.test.ts`

Expected: FAIL because `OTP_SPACE_API_KEY` is still in `REQUIRED_IN_PRODUCTION`.

- [ ] **Step 3: Remove OTP provider requirement**

Change `src/lib/provider-startup-check.ts`:

```ts
const REQUIRED_IN_PRODUCTION = ["RESEND_API_KEY"] as const;
```

Keep error text generic:

```ts
`Production requires these provider keys: ${missing.join(", ")}. Set them or mock mode stays off in prod.`
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/provider-startup-check.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Only if the user explicitly asks for commits during execution, run:

```bash
git add src/lib/provider-startup-check.ts src/lib/provider-startup-check.test.ts
git commit -m "feat(auth): remove otpspace provider requirement"
```

---

### Task 5: Drop OTP Schema Safely

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_remove_otp_verification/migration.sql`

**Interfaces:**

- Consumes: existing Prisma schema
- Produces: Prisma schema with no OTP-specific model/fields and a migration that drops only OTP-specific structures

- [ ] **Step 1: Inspect non-OTP phone usage before dropping `User.phone`**

Run: `rg "\.phone|phone\b|OtpRequest|otpRequests|verifiedAt|otpAttempts|otpLockedUntil" src prisma tests`

Expected: after Tasks 1-4, remaining active matches for `User.phone` should be OTP-only or schema-only. If a non-OTP product feature uses `User.phone`, stop and ask the user before dropping `User.phone`.

- [ ] **Step 2: Update Prisma schema**

In `prisma/schema.prisma`, remove these fields from `model User`:

```prisma
phone           String?                 @unique @db.VarChar(20)
verifiedAt      DateTime?
otpAttempts     Int                     @default(0)
otpLockedUntil  DateTime?
otpRequests     OtpRequest[]
@@index([verifiedAt])
```

Delete the whole `model OtpRequest` block:

```prisma
model OtpRequest {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  phone     String   @db.VarChar(20)
  codeHash  String   @db.VarChar(64)
  attempts  Int      @default(0)
  used      Boolean  @default(false)
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([userId, phone])
  @@index([expiresAt])
}
```

- [ ] **Step 3: Create targeted migration**

Create `prisma/migrations/<timestamp>_remove_otp_verification/migration.sql` with only these statements, adjusted only if the actual generated constraint/index names differ:

```sql
DROP TABLE IF EXISTS "OtpRequest";

DROP INDEX IF EXISTS "User_verifiedAt_idx";

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "phone",
  DROP COLUMN IF EXISTS "verifiedAt",
  DROP COLUMN IF EXISTS "otpAttempts",
  DROP COLUMN IF EXISTS "otpLockedUntil";
```

Do not add `DELETE`, `TRUNCATE`, or drops for non-OTP tables.

- [ ] **Step 4: Validate migration text before running**

Run: `rg "DELETE|TRUNCATE|DROP TABLE|DROP COLUMN|DROP INDEX" prisma/migrations/<timestamp>_remove_otp_verification/migration.sql`

Expected: only `DROP TABLE IF EXISTS "OtpRequest"`, `DROP INDEX IF EXISTS "User_verifiedAt_idx"`, and OTP-specific `DROP COLUMN` statements appear.

- [ ] **Step 5: Run Prisma validation or focused schema command**

Run the repository Prisma validation command if one exists in `package.json`. If not, rely on TypeScript/test generation during `bun run check` after all tasks.

Expected: schema parses and Prisma client generation in later check does not reference removed fields.

- [ ] **Step 6: Commit**

Only if the user explicitly asks for commits during execution, run:

```bash
git add prisma/schema.prisma prisma/migrations/<timestamp>_remove_otp_verification/migration.sql
git commit -m "feat(auth): drop otp schema"
```

---

### Task 6: Update Active Env And Docs

**Files:**

- Modify: `.env.example`
- Modify: `AGENTS.md`
- Modify: `DEV.md`
- Modify: active docs only when they present OTP as current setup

**Interfaces:**

- Consumes: current design spec `docs/superpowers/specs/2026-08-04-remove-otp-verification-design.md`
- Produces: setup/docs that no longer tell developers OTP is required or active

- [ ] **Step 1: Update `.env.example`**

Remove:

```dotenv
# ── OTP (OTPSpace) ──
OTP_SPACE_API_KEY=""
```

Do not edit `.env`.

- [ ] **Step 2: Update `AGENTS.md`**

Remove `src/lib/otp.ts` from the key modules list. Keep unrelated key modules unchanged.

- [ ] **Step 3: Update `DEV.md` active setup text**

Change the production trust-boundary bullet so it no longer names OTP delivery as an active dependency. Replace:

```md
Missing providers, moderation, OTP delivery, storage, or other trust-boundary dependencies must fail clearly instead of returning success.
```

with:

```md
Missing providers, moderation, storage, or other trust-boundary dependencies must fail clearly instead of returning success.
```

Change the `.env.example` grouping sentence from:

```md
grouped by concern (app, database, auth, AI, storage, email, OTP, payment, analytics, public sites)
```

to:

```md
grouped by concern (app, database, auth, AI, storage, email, payment, analytics, public sites)
```

Change the client data cache section so it no longer mentions `queryKeys.verification` or OTP verify. Replace the active guidance with:

```md
Gate keys such as `queryKeys.waitlistStatus` use `GATE_QUERY_OPTIONS` (10s stale, refetch on window focus + reconnect). While the user is waitlisted with a pending/waitlisted own entry, waitlist status polls every 30s. After waitlist submit or dev waitlist changes, call `invalidateWaitlistStatus` so `/` chrome updates without a full browser refresh.
```

- [ ] **Step 4: Add supersession notes only where current setup could drift**

Search active docs:

```bash
rg "OTP|OTPSpace|OTP_SPACE_API_KEY|/verify|api/auth/otp|verification" AGENTS.md DEV.md PRODUCT.md README.md docs/superpowers/specs docs/superpowers/plans
```

Do not rewrite generic `verification` or unrelated `verify` content. For historical OTP docs that are clearly old specs, add no edits unless the document has a `Status: Shipped/current` line that could mislead future agents. For `docs/superpowers/specs/2026-07-25-email-otp-design.md`, add near the top:

```md
> Superseded for OTP by `docs/superpowers/specs/2026-08-04-remove-otp-verification-design.md`. Email adapter guidance remains historical/contextual; WhatsApp OTP is no longer active product behavior.
```

For `docs/superpowers/specs/2026-08-03-post-verify-waitlist-redirect-and-dev-admin-gate-design.md`, add near the top:

```md
> Superseded by `docs/superpowers/specs/2026-08-04-remove-otp-verification-design.md`. The product no longer has a post-OTP verify step; waitlist routing now starts after Google OAuth sign-in.
```

- [ ] **Step 5: Run docs/env search**

Run:

```bash
rg "OTP_SPACE_API_KEY|OTPSpace|api/auth/otp|src/lib/otp|/api/dev/(skip|reset)-verification|Reset Verifikasi|Skip OTP" .env.example AGENTS.md DEV.md src prisma docs/superpowers/specs docs/superpowers/plans
```

Expected: no active code/env/doc references. Historical docs may only contain OTP references with clear supersession notes.

- [ ] **Step 6: Commit**

Only if the user explicitly asks for commits during execution, run:

```bash
git add .env.example AGENTS.md DEV.md docs/superpowers/specs/2026-07-25-email-otp-design.md docs/superpowers/specs/2026-08-03-post-verify-waitlist-redirect-and-dev-admin-gate-design.md
git commit -m "docs(auth): remove active otp setup"
```

---

### Task 7: Final Search, Type Cleanup, And Quality Gate

**Files:**

- Inspect: full repository active surfaces
- Modify: any files with stale imports/types from prior tasks

**Interfaces:**

- Consumes: all previous tasks
- Produces: clean worktree diff where active OTP is gone and unrelated verify behavior remains

- [ ] **Step 1: Search active code for OTP leftovers**

Run:

```bash
rg "\botp\b|\bOTP\b|OTPSpace|OTP_SPACE_API_KEY|api/auth/otp|skip-verification|reset-verification|fetchUserVerification|isUserVerified|verifiedAt|otpAttempts|otpLockedUntil|OtpRequest" src prisma .env.example AGENTS.md DEV.md
```

Expected: no matches. If `isUserVerified` remains only because another non-OTP feature uses it, stop and document why; otherwise remove it.

- [ ] **Step 2: Search `/verify` carefully**

Run:

```bash
rg '"/verify"|`/verify`|to: "/verify"|replace\("/verify"\)|fullPath: .*/verify|path: .*/verify' src docs AGENTS.md DEV.md
```

Expected: no active auth `/verify` references. Allowed unrelated results must be payment/admin transaction verify, project runtime verification, or historical docs with supersession notes.

- [ ] **Step 3: Run focused tests**

Run:

```bash
bun run test src/server/loaders/check-route-gates.test.ts src/lib/query-client.test.ts src/lib/provider-startup-check.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run full check**

Run:

```bash
bun run check
```

Expected: PASS. This should catch route-tree, TypeScript, lint, formatting, tests, and Knip issues.

- [ ] **Step 5: Inspect git diff and status**

Run:

```bash
git status --short --untracked-files=all
git diff -- . ':(exclude).env'
```

Expected: `.env` is absent from the diff/status. Diff contains only OTP removal, schema migration, route tree regeneration, and active docs/env example updates.

- [ ] **Step 6: Final commit**

Only if the user explicitly asks for commits during execution and previous task commits were not made, run:

```bash
git add -A
git diff --cached -- . ':(exclude).env'
git commit -m "feat(auth): remove otp verification"
```

---

## Self-Review

Spec coverage:

- OTP route/API deletion is covered by Task 3.
- Server/client gate changes are covered by Tasks 1 and 2.
- Provider/env cleanup is covered by Tasks 4 and 6.
- Schema drop safety is covered by Task 5.
- Active docs cleanup is covered by Task 6.
- Search boundaries for unrelated verify surfaces are covered by Task 7.
- `.env` is explicitly excluded in global constraints and Task 6/7.

Placeholder scan:

- No task contains unresolved placeholder markers or unspecified handling.
- Every task has exact files, commands, and expected outcomes.

Type consistency:

- `checkRouteGates(pathname: string): Promise<{ ok: true }>` remains the server gate interface.
- `fetchWaitlistStatus`, `queryKeys.waitlistStatus`, `GATE_QUERY_OPTIONS`, and `waitlistPendingPollInterval` remain the client waitlist interfaces.
- Deleted verification names are not used as produced interfaces for later tasks.
