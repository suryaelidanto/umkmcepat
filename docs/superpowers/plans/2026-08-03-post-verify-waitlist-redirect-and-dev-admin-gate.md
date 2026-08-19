# Post-Verify Waitlist Redirect + Dev-Admin Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After OTP success, redirect to `/waitlist` when waitlist gate applies; restrict all `/api/dev/*` skip/reset tools and their UI to development + `ADMIN_EMAILS` admin only.

**Architecture:** Pure destination helper from waitlist status string. Client `verify.tsx` fetches fresh waitlist status after OTP and replaces to `/` or `/waitlist`. Dev tools share `requireDevAdmin` (NODE_ENV development + `requireAdmin` / `isAdminEmail`). Client discovers eligibility via `canUseDevTools` on `/api/user/verification`.

**Tech Stack:** TanStack Router/Start, React Query, Vitest, existing `isAdminEmail` / `requireAdmin` / waitlist status API.

## Global Constraints

- User-facing copy Indonesian; code/docs/logs English.
- Admin = email in `ADMIN_EMAILS` via `isAdminEmail()` — never hardcode emails.
- Never write real secrets/emails into tracked files; tests use fake addresses.
- Fail-safe destination when status unknown: `/waitlist`.
- Homepage marketing access for waitlisted users stays open (do not re-lock `/`).
- Bun only. Focused tests per task; `bun run check` before handoff.
- Surgical diffs; no drive-by refactors.

**Spec:** `docs/superpowers/specs/2026-08-03-post-verify-waitlist-redirect-and-dev-admin-gate-design.md`

---

## File Map

| File | Role |
|---|---|
| Create: `src/lib/post-verify-destination.ts` | Pure `postVerifyDestination(status)` |
| Create: `src/lib/post-verify-destination.test.ts` | Unit tests |
| Create: `src/lib/dev-admin.ts` | `requireDevAdmin()` + pure `canUseDevTools({ isDev, isAdmin })` |
| Create: `src/lib/dev-admin.test.ts` | Unit tests |
| Modify: `src/routes/api.dev.skip-verification.ts` | Gate with `requireDevAdmin` |
| Modify: `src/routes/api.dev.reset-verification.ts` | Gate with `requireDevAdmin` |
| Modify: `src/routes/api.dev.skip-waitlist.ts` | Gate with `requireDevAdmin` |
| Modify: `src/routes/api.dev.reset-waitlist.ts` | Gate with `requireDevAdmin` |
| Modify: `src/routes/api.user.verification.ts` | Add `canUseDevTools` |
| Modify: `src/lib/query-client.ts` | `UserVerification.canUseDevTools` |
| Modify: `src/lib/query-client.test.ts` | Expect new field |
| Modify: `src/routes/verify.tsx` | Destination + copy + skip UI gate |
| Modify: `src/components/common/MainChrome.tsx` | DEV bar only if `canUseDevTools` |
| Modify: `src/routes/_main.waitlist.tsx` | Keep `isDev && isAdmin` (verify still correct) |
| Optional: `DEV.md` | Note admin+dev if it mentions open skip tools |

---

### Task 1: Pure post-verify destination helper

**Files:**
- Create: `src/lib/post-verify-destination.ts`
- Create: `src/lib/post-verify-destination.test.ts`

**Interfaces:**
- Consumes: none
- Produces: `postVerifyDestination(waitlistStatus: string | null | undefined): "/" | "/waitlist"`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";

import { postVerifyDestination } from "./post-verify-destination";

describe("postVerifyDestination", () => {
  it('returns "/" when status is approved', () => {
    expect(postVerifyDestination("approved")).toBe("/");
  });

  it('returns "/waitlist" when status is null', () => {
    expect(postVerifyDestination(null)).toBe("/waitlist");
  });

  it('returns "/waitlist" when status is undefined', () => {
    expect(postVerifyDestination(undefined)).toBe("/waitlist");
  });

  it('returns "/waitlist" for pending / waitlisted / rejected / other', () => {
    expect(postVerifyDestination("pending")).toBe("/waitlist");
    expect(postVerifyDestination("waitlisted")).toBe("/waitlist");
    expect(postVerifyDestination("rejected")).toBe("/waitlist");
    expect(postVerifyDestination("weird")).toBe("/waitlist");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `bun test src/lib/post-verify-destination.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

```ts
// src/lib/post-verify-destination.ts
export function postVerifyDestination(
  waitlistStatus: string | null | undefined,
): "/" | "/waitlist" {
  return waitlistStatus === "approved" ? "/" : "/waitlist";
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test src/lib/post-verify-destination.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/post-verify-destination.ts src/lib/post-verify-destination.test.ts
git commit -m "feat: add postVerifyDestination helper"
```

---

### Task 2: `requireDevAdmin` + pure canUseDevTools

**Files:**
- Create: `src/lib/dev-admin.ts`
- Create: `src/lib/dev-admin.test.ts`

**Interfaces:**
- Consumes: `auth` from `@/lib/auth/auth`, `isAdminEmail` from `@/lib/waitlist/waitlist` (or reuse `requireAdmin` from `@/lib/auth/auth-admin`)
- Produces:
  - `canUseDevTools(input: { isDevelopment: boolean; isAdmin: boolean }): boolean`
  - `requireDevAdmin(): Promise<AdminCheck>` — same shape as `requireAdmin` (`AdminCheck` from `@/lib/auth/auth-admin`)

- [ ] **Step 1: Write failing tests**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { canUseDevTools } from "./dev-admin";

describe("canUseDevTools", () => {
  it("true only when development and admin", () => {
    expect(canUseDevTools({ isDevelopment: true, isAdmin: true })).toBe(true);
    expect(canUseDevTools({ isDevelopment: true, isAdmin: false })).toBe(false);
    expect(canUseDevTools({ isDevelopment: false, isAdmin: true })).toBe(false);
    expect(canUseDevTools({ isDevelopment: false, isAdmin: false })).toBe(
      false,
    );
  });
});

// requireDevAdmin: mock auth + isAdminEmail + NODE_ENV
// cases: non-development → 403; no session → 401; non-admin → 403; ok → ok:true
```

For `requireDevAdmin` tests, follow patterns in existing auth-admin or waitlist tests: `vi.stubEnv("NODE_ENV", ...)`, mock `@/lib/auth/auth` and `@/lib/waitlist/waitlist` as needed. Prefer testing pure `canUseDevTools` thoroughly and a thin `requireDevAdmin` that:

1. if `process.env.NODE_ENV !== "development"` → `{ ok: false, status: 403, message: "Endpoint ini hanya tersedia di mode development." }`
2. else return `await requireAdmin()` (reuse messages from `requireAdmin`)

- [ ] **Step 2: Run tests — expect FAIL**

Run: `bun test src/lib/dev-admin.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

```ts
// src/lib/dev-admin.ts
import { requireAdmin, type AdminCheck } from "@/lib/auth/auth-admin";

export function canUseDevTools(input: {
  isDevelopment: boolean;
  isAdmin: boolean;
}): boolean {
  return input.isDevelopment && input.isAdmin;
}

export async function requireDevAdmin(): Promise<AdminCheck> {
  if (process.env.NODE_ENV !== "development") {
    return {
      ok: false,
      status: 403,
      message: "Endpoint ini hanya tersedia di mode development.",
    };
  }
  return requireAdmin();
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test src/lib/dev-admin.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/dev-admin.ts src/lib/dev-admin.test.ts
git commit -m "feat: add requireDevAdmin for skip/reset APIs"
```

---

### Task 3: Gate all four `/api/dev/*` routes

**Files:**
- Modify: `src/routes/api.dev.skip-verification.ts`
- Modify: `src/routes/api.dev.reset-verification.ts`
- Modify: `src/routes/api.dev.skip-waitlist.ts`
- Modify: `src/routes/api.dev.reset-waitlist.ts`

**Interfaces:**
- Consumes: `requireDevAdmin()`
- Produces: 403/401 before mutation; existing success JSON unchanged

- [ ] **Step 1: Apply the same gate pattern to each POST handler**

Replace the open `if (process.env.NODE_ENV !== "development")` + separate session checks with:

```ts
import { requireDevAdmin } from "@/lib/admin/dev-admin";

// inside POST:
const gate = await requireDevAdmin();
if (!gate.ok) {
  return Response.json({ message: gate.message }, { status: gate.status });
}
// then existing mutation using gate.admin.userId / gate.admin.email
```

**skip-verification:** use `gate.admin.userId` (and email if create path needs it) instead of re-reading session when possible. If handler still needs full session user name, call `auth()` only after gate passes, or keep prisma upsert with admin userId + email from `gate.admin`.

**skip-waitlist / reset-waitlist:** pass `gate.admin.email` into `devApproveOwnWaitlistEntry` / `devResetOwnWaitlistEntry`.

**reset-verification:** update by `gate.admin.userId`.

Remove duplicate bare `NODE_ENV` / anonymous checks once `requireDevAdmin` covers them.

- [ ] **Step 2: Manual sanity (no full suite yet)**

Optional focused test file not required if pure unit tests cover the helper; if you add route tests, mock `requireDevAdmin`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/api.dev.skip-verification.ts \
  src/routes/api.dev.reset-verification.ts \
  src/routes/api.dev.skip-waitlist.ts \
  src/routes/api.dev.reset-waitlist.ts
git commit -m "fix: require admin+dev for /api/dev skip and reset"
```

---

### Task 4: Expose `canUseDevTools` on verification API + client type

**Files:**
- Modify: `src/routes/api.user.verification.ts`
- Modify: `src/lib/query-client.ts`
- Modify: `src/lib/query-client.test.ts`

**Interfaces:**
- Consumes: `canUseDevTools`, `isAdminEmail`, `process.env.NODE_ENV`
- Produces: JSON `{ verified: boolean; canUseDevTools: boolean }`; client `UserVerification` includes `canUseDevTools: boolean` (false for 401 guest path)

- [ ] **Step 1: Update failing client tests first**

In `src/lib/query-client.test.ts` `fetchUserVerification` cases:

- 401 path → `{ signedIn: false, verified: false, canUseDevTools: false }`
- 200 path → map `canUseDevTools` from body (default false if missing)

- [ ] **Step 2: Run tests — expect FAIL**

Run: `bun test src/lib/query-client.test.ts`

Expected: FAIL on new field expectations.

- [ ] **Step 3: Implementation**

`api.user.verification.ts`:

```ts
import { isAdminEmail } from "@/lib/waitlist/waitlist";
import { canUseDevTools } from "@/lib/admin/dev-admin";

// after session ok:
const verified = await isUserVerified(session.user.id);
const canUse = canUseDevTools({
  isDevelopment: process.env.NODE_ENV === "development",
  isAdmin: isAdminEmail(session.user.email ?? ""),
});
return Response.json({ verified, canUseDevTools: canUse });
```

`query-client.ts`:

```ts
export type UserVerification = {
  signedIn: boolean;
  verified: boolean;
  canUseDevTools: boolean;
};

// 401:
return { signedIn: false, verified: false, canUseDevTools: false };

// success:
return {
  signedIn: true,
  verified: Boolean(result.data.verified),
  canUseDevTools: Boolean(result.data.canUseDevTools),
};
```

Update `parseApiResponse` generic to include `canUseDevTools?: boolean`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test src/lib/query-client.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.user.verification.ts src/lib/query-client.ts src/lib/query-client.test.ts
git commit -m "feat: expose canUseDevTools on verification API"
```

---

### Task 5: Wire `verify.tsx` redirect + copy + skip UI

**Files:**
- Modify: `src/routes/verify.tsx`

**Interfaces:**
- Consumes: `postVerifyDestination`, `fetchWaitlistStatus`, `canUseDevTools` from verification query / cache
- Produces: success navigate to `/` or `/waitlist`; skip button only if `canUseDevTools`

- [ ] **Step 1: Shared success navigation helper inside the component (or file-local function)**

```ts
import { postVerifyDestination } from "@/lib/post-verify-destination";
import {
  fetchWaitlistStatus,
  // existing imports
} from "@/lib/query-client";

// state:
const [doneDestination, setDoneDestination] = useState<"/" | "/waitlist">("/");

async function finishVerificationSuccess() {
  setFlowState("done");
  queryClient.setQueryData(queryKeys.verification, {
    signedIn: true,
    verified: true,
    canUseDevTools:
      queryClient.getQueryData<UserVerification>(queryKeys.verification)
        ?.canUseDevTools ?? false,
  });
  await queryClient.invalidateQueries({ queryKey: queryKeys.verification });
  await invalidateWaitlistStatus(queryClient);
  let destination: "/" | "/waitlist" = "/waitlist";
  try {
    const status = await fetchWaitlistStatus();
    destination = postVerifyDestination(status.status);
  } catch {
    destination = "/waitlist";
  }
  setDoneDestination(destination);
  setTimeout(() => router.replace(destination), 1500);
}
```

Use `finishVerificationSuccess` in both `verifyOtpMutation.onSuccess` and `skipMutation.onSuccess`.

- [ ] **Step 2: Done screen copy**

```tsx
<p className="mt-2 text-sm text-surface-warm-white/62">
  {doneDestination === "/waitlist"
    ? "Lanjut isi formulir antrean…"
    : "Selamat datang di UMKM Cepat. Mengalihkan..."}
</p>
```

- [ ] **Step 3: Skip button gate**

Replace `const isDev = import.meta.env.DEV` with:

```ts
const canUseDevTools = Boolean(verificationQuery.data?.canUseDevTools);
```

Render skip block when `canUseDevTools` (not bare DEV).

Optional: extend `requireUnverified` loader to return `{ canUseDevTools }` so first paint is correct without waiting for client query — if verification query already runs on the page, query is enough.

- [ ] **Step 4: Align already-verified server redirect (same file `requireUnverified`)**

When user is already verified, choose destination from waitlist status instead of always `/`:

```ts
if (await isUserVerified(session.user.id)) {
  const { resolveUserWaitlistStatus } = await import(
    "@/routes/api.user.waitlist"
  );
  const { isAdminEmail, isWaitlistApproved } = await import("@/lib/waitlist/waitlist");
  const { isWaitlistEnabled } = await import("@/lib/waitlist/waitlist-enabled");
  const email = session.user.email ?? "";
  const resolved = resolveUserWaitlistStatus({
    email,
    isAdmin: email ? isAdminEmail(email) : false,
    isApproved: email ? await isWaitlistApproved(email) : null,
    waitlistEnabled: await isWaitlistEnabled(),
  });
  const to = postVerifyDestination(resolved.status);
  throw redirect({ to });
}
```

Import `postVerifyDestination` on the server side of the same module (pure helper is fine).

- [ ] **Step 5: Smoke — no automated browser**

Manually note in commit: waitlist on → OTP → `/waitlist`; waitlist off → `/`.

- [ ] **Step 6: Commit**

```bash
git add src/routes/verify.tsx
git commit -m "feat: redirect post-OTP to waitlist when gate applies"
```

---

### Task 6: MainChrome DEV bar admin+dev only

**Files:**
- Modify: `src/components/common/MainChrome.tsx`

**Interfaces:**
- Consumes: `verificationQuery.data?.canUseDevTools`
- Produces: orange DEV bar only when `canUseDevTools`

- [ ] **Step 1: Replace `const isDev = import.meta.env.DEV`**

```ts
const canUseDevTools = Boolean(verificationQuery.data?.canUseDevTools);
```

- [ ] **Step 2: Gate the bar**

```tsx
{canUseDevTools ? (
  <div className="...">DEV: Mode Pengembang ...</div>
) : null}
```

Reset mutations already hit gated APIs — UI hide is enough for non-admins; API still 403 if called.

- [ ] **Step 3: Confirm waitlist page still uses `isDev && isAdmin` from loader**

No change required if already correct. If waitlist used bare DEV for anything else, leave unless it exposes skip without admin.

- [ ] **Step 4: Commit**

```bash
git add src/components/common/MainChrome.tsx
git commit -m "fix: show MainChrome dev tools only for admin in development"
```

---

### Task 7: Docs touch + verification

**Files:**
- Modify if needed: `DEV.md` (only if it documents open skip for any local user)
- Spec/plan already exist

- [ ] **Step 1: Grep DEV docs**

```bash
rg -n "skip-verification|Skip verifikasi|dev mode|skip-waitlist" DEV.md docs/ -g'*.md'
```

If DEV.md says any local user can skip, update one sentence: require `ADMIN_EMAILS` match + development.

- [ ] **Step 2: Focused tests**

```bash
bun test src/lib/post-verify-destination.test.ts src/lib/dev-admin.test.ts src/lib/query-client.test.ts
```

Expected: PASS

- [ ] **Step 3: Fast gate**

```bash
bun run check
```

Expected: PASS (format/lint/typecheck/affected tests/Knip)

- [ ] **Step 4: Final commit if docs changed**

```bash
git add DEV.md
git commit -m "docs: clarify dev skip tools need admin + development"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| post-OTP → `/waitlist` when not approved | Task 1 + 5 |
| approved / gate off → `/` | Task 1 + 5 |
| fail-safe `/waitlist` on status error | Task 5 |
| success copy per destination | Task 5 |
| already-verified `/verify` same rule | Task 5 |
| all four `/api/dev/*` admin+dev | Task 2 + 3 |
| verify skip UI admin+dev | Task 4 + 5 |
| MainChrome DEV bar admin+dev | Task 4 + 6 |
| waitlist skip already admin+dev | Task 6 verify only |
| Energy order-id out of scope | no task |
| unit tests for pure helpers | Task 1, 2, 4 |
| no re-lock homepage | no gate reversion |

No TBD placeholders. Types: `UserVerification.canUseDevTools`, `postVerifyDestination` return `"/" | "/waitlist"`, `requireDevAdmin` → `AdminCheck`.
