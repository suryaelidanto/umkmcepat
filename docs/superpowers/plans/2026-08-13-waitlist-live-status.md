# Waitlist Live Status and Admin Queue Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make waitlist approval, rejection, and resubmission converge across the open user and admin surfaces without a manual browser refresh, while preserving server-side gates and making approval plus the pilot grant atomic.

**Architecture:** TanStack Query remains the client freshness layer. `queryKeys.waitlistStatus` becomes the only user waitlist cache; bounded 15-second pending polling plus focus/reconnect refetching makes another browser's decision visible without WebSockets or SSE. Admin decisions invalidate the queue, summary, nav, and current admin status. Approval and the one-time pilot grant run in one Prisma transaction.

**Tech Stack:** Bun, TypeScript, React 19, TanStack Query 5, TanStack Router, Prisma/PostgreSQL, Vitest, existing email and query helpers.

## Global Constraints

- Use Bun only; keep `bun.lock` canonical.
- Write failing tests before production changes and watch each focused test fail for the expected reason.
- Preserve `requireAdmin()`, server route gates, production admin bypass, development admin test semantics, and rejection/resubmission behavior.
- Do not add a dependency, database migration, WebSocket, SSE, BroadcastChannel, or client-only access gate.
- User-facing copy stays Indonesian; code, tests, logs, and docs stay English.
- No `any`, `as any`, `ts-ignore`, or unjustified lint suppression.
- Keep the unrelated pre-existing working-tree changes out of every commit.
- No fake approval: server responses and the route gate remain authoritative; client cache updates only reconcile server-confirmed mutations.
- Run the nearest focused tests after every task, then run `bun run check` before any completion claim or push.
- Do not run `bun run build`; this change does not touch build or deployment behavior.
- Update `DEV.md` because the client-data and admin-refresh behavior changes.

---

## File map

| File | Responsibility in this change |
| --- | --- |
| `src/lib/query-client.ts` | Shared query roots, live intervals, canonical waitlist response type, invalidation helpers. |
| `src/lib/query-client.test.ts` | Polling and invalidation contract tests. |
| `src/lib/waitlist-view.ts` | Pure waitlist-page state resolution. |
| `src/lib/waitlist-view.test.ts` | Approval/rejection/submission precedence tests. |
| `src/lib/user-credits.ts` | Optional transaction client for pilot-grant insertion. |
| `src/lib/user-credits.test.ts` | Default and transaction-client grant tests. |
| `src/lib/waitlist.ts` | Shared pending statuses and transactional approval flow. |
| `src/lib/waitlist-energy.test.ts` | Transaction-aware approval unit tests. |
| `src/lib/waitlist.test.ts` | Pending-status helper tests if needed by the chosen implementation. |
| `src/routes/_main.waitlist.tsx` | One canonical query, polling, approval transition, and rejection recovery. |
| `src/routes/_main.admin.waitlist.tsx` | Queue polling, shared query keys, invalidation, and action loading copy. |
| `src/components/admin/AdminShell.tsx` | Shared nav-count query key and 30-second summary refresh. |
| `src/routes/_main.admin.index.lazy.tsx` | Shared overview query key and 30-second refresh. |
| `src/routes/api.admin.nav-counts.ts` | Use the shared pending-status set. |
| `src/routes/api.admin.overview.ts` | Use the shared pending-status set for KPI and recent queue rows. |
| `src/routes/-api.admin.waitlist.test.ts` | Approve/reject endpoint regression tests. |
| `tests/integration/waitlist-approval.itest.ts` | Real PostgreSQL atomic approval and idempotent grant coverage. |
| `DEV.md` | Document the canonical status cache and bounded polling. |

---

### Task 1: Establish the canonical waitlist client contract and state resolver

**Files:**
- Modify: `src/lib/query-client.ts`
- Test: `src/lib/query-client.test.ts`
- Create: `src/lib/waitlist-view.ts`
- Test: `src/lib/waitlist-view.test.ts`

**Interfaces:**
- Produces `queryKeys.adminOverview`, `queryKeys.adminNavCounts`, and the existing `queryKeys.adminWaitlist` base root.
- Produces `WAITLIST_PENDING_POLL_MS = 15_000`, `ADMIN_WAITLIST_POLL_MS = 15_000`, and `ADMIN_SUMMARY_POLL_MS = 30_000`.
- Produces `WaitlistOwnStatus`, the expanded `WaitlistStatusResponse`, `invalidateWaitlistStatus(queryClient)`, and `invalidateAdminWaitlistData(queryClient)`.
- Produces `resolveWaitlistView({ effectiveStatus, ownStatus, submitted })` returning `"approval" | "success" | "form"`.

- [ ] **Step 1: Add the failing waitlist view tests**

Create `src/lib/waitlist-view.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { resolveWaitlistView } from "./waitlist-view";

describe("resolveWaitlistView", () => {
  it("lets approved status override a local submitted flag", () => {
    expect(
      resolveWaitlistView({
        effectiveStatus: "approved",
        ownStatus: "pending",
        submitted: true,
      }),
    ).toBe("approval");
  });

  it("lets rejection override a local submitted flag", () => {
    expect(
      resolveWaitlistView({
        effectiveStatus: null,
        ownStatus: "rejected",
        submitted: true,
      }),
    ).toBe("form");
  });

  it("keeps a pending entry on the thank-you screen", () => {
    expect(
      resolveWaitlistView({
        effectiveStatus: null,
        ownStatus: "pending",
        submitted: false,
      }),
    ).toBe("success");
  });

  it("uses the form when there is no entry", () => {
    expect(
      resolveWaitlistView({
        effectiveStatus: null,
        ownStatus: null,
        submitted: false,
      }),
    ).toBe("form");
  });
});
```

- [ ] **Step 2: Run the view test and verify the failure is about the missing module**

Run:

```bash
bunx vitest run --project unit src/lib/waitlist-view.test.ts
```

Expected: FAIL because `src/lib/waitlist-view.ts` does not exist. Do not proceed if the failure is a test typo or an unrelated transform error.

- [ ] **Step 3: Add the minimal pure resolver**

Create `src/lib/waitlist-view.ts`:

```ts
export type WaitlistView = "approval" | "success" | "form";

export function resolveWaitlistView(input: {
  effectiveStatus: string | null | undefined;
  ownStatus: string | null | undefined;
  submitted: boolean;
}): WaitlistView {
  if (input.effectiveStatus === "approved") {
    return "approval";
  }
  if (input.ownStatus === "rejected") {
    return "form";
  }
  if (
    input.submitted ||
    input.ownStatus === "pending" ||
    input.ownStatus === "waitlisted"
  ) {
    return "success";
  }
  return "form";
}
```

- [ ] **Step 4: Run the view test and verify it passes**

Run:

```bash
bunx vitest run --project unit src/lib/waitlist-view.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Add failing invalidation and interval assertions**

Extend `src/lib/query-client.test.ts` imports:

```ts
import {
  ADMIN_SUMMARY_POLL_MS,
  ADMIN_WAITLIST_POLL_MS,
  invalidateAdminWaitlistData,
  queryKeys,
  WAITLIST_PENDING_POLL_MS,
  waitlistPendingPollInterval,
} from "./query-client";
```

Keep the existing polling cases and add:

```ts
it("uses the bounded user pending interval", () => {
  expect(WAITLIST_PENDING_POLL_MS).toBe(15_000);
  expect(ADMIN_WAITLIST_POLL_MS).toBe(15_000);
  expect(ADMIN_SUMMARY_POLL_MS).toBe(30_000);
});

it("invalidates the active admin and user waitlist surfaces", async () => {
  const client = new QueryClient();
  const invalidate = vi
    .spyOn(client, "invalidateQueries")
    .mockResolvedValue(undefined);

  await invalidateAdminWaitlistData(client);

  expect(invalidate).toHaveBeenCalledWith({
    queryKey: queryKeys.adminWaitlist,
    refetchType: "active",
  });
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: queryKeys.adminNavCounts,
    refetchType: "active",
  });
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: queryKeys.adminOverview,
    refetchType: "active",
  });
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: queryKeys.waitlistStatus,
    refetchType: "active",
  });
  expect(invalidate).toHaveBeenCalledTimes(4);
});
```

- [ ] **Step 6: Run the query-client test and verify the new assertions fail**

Run:

```bash
bunx vitest run --project unit src/lib/query-client.test.ts
```

Expected: FAIL because the new constants, keys, and helper do not exist yet. Existing polling and fetchJson tests must still execute.

- [ ] **Step 7: Implement the shared query contract and invalidation helpers**

In `src/lib/query-client.ts`:

1. Add these roots to `queryKeys`:

```ts
adminOverview: ["admin", "overview"] as const,
adminNavCounts: ["admin", "nav-counts"] as const,
```

Keep `adminWaitlist: ["admin", "waitlist"] as const` as the base root.

2. Replace the 30-second user constant with:

```ts
export const WAITLIST_PENDING_POLL_MS = 15_000;
export const ADMIN_WAITLIST_POLL_MS = 15_000;
export const ADMIN_SUMMARY_POLL_MS = 30_000;
```

3. Add the full client-safe own-entry shape and use it in `WaitlistStatusResponse`:

```ts
export type WaitlistOwnStatus = {
  businessName: string;
  businessType: string | null;
  id: string;
  rejectionReason: string | null;
  status: string;
  story: string;
};

export type WaitlistStatusResponse = {
  canUseDevTools?: boolean;
  status: string | null;
  own?: WaitlistOwnStatus | null;
};
```

4. Make `invalidateWaitlistStatus` invalidate only the canonical key with active refetch semantics:

```ts
export async function invalidateWaitlistStatus(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: queryKeys.waitlistStatus,
    refetchType: "active",
  });
}
```

5. Add the admin invalidation helper:

```ts
export async function invalidateAdminWaitlistData(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.adminWaitlist,
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.adminNavCounts,
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.adminOverview,
      refetchType: "active",
    }),
    invalidateWaitlistStatus(queryClient),
  ]);
}
```

Do not change `waitlistPendingPollInterval` logic apart from consuming the new constant.

- [ ] **Step 8: Run both focused tests and verify they pass**

Run:

```bash
bunx vitest run --project unit src/lib/waitlist-view.test.ts src/lib/query-client.test.ts
```

Expected: all tests in both files pass.

- [ ] **Step 9: Inspect the key migration before committing**

Run:

```bash
rg -n 'user.*waitlist.*own|admin.*overview|admin.*nav-counts|WAITLIST_PENDING_POLL_MS' src/lib src/routes src/components
```

Expected at this checkpoint: the old own-only key may still appear in `_main.waitlist.tsx` and will be removed in Task 3; no unrelated query keys are changed.

- [ ] **Step 10: Commit the canonical client contract**

```bash
git add src/lib/query-client.ts src/lib/query-client.test.ts src/lib/waitlist-view.ts src/lib/waitlist-view.test.ts
git commit -m "feat(waitlist): centralize live status cache"
```

---

### Task 2: Make approval and the pilot grant atomic

**Files:**
- Modify: `src/lib/user-credits.ts`
- Test: `src/lib/user-credits.test.ts`
- Modify: `src/lib/waitlist.ts`
- Test: `src/lib/waitlist-energy.test.ts`
- Test: `src/lib/waitlist.test.ts`

**Interfaces:**
- `grantSignupEnergy(userId: string, database?: CreditDatabase)` accepts an optional transaction-compatible client without changing one-argument callers.
- `WAITLIST_PENDING_STATUSES` is the shared readonly status set.
- `isWaitlistPendingStatus(status: string): boolean` returns true only for `pending` and `waitlisted`.
- `approveWaitlistEntry` performs its entry update, user link, and pilot grant inside one Prisma transaction.

- [ ] **Step 1: Add the failing transaction-client credit test**

In `src/lib/user-credits.test.ts`, add this case to the `grantSignupEnergy` suite:

```ts
it("writes through a supplied transaction client", async () => {
  const transactionExecuteRawMock = vi.fn().mockResolvedValue(1);
  const transactionClient = {
    $executeRaw: transactionExecuteRawMock,
  };

  await expect(grantSignupEnergy("u-transaction", transactionClient)).resolves.toBe(
    true,
  );

  expect(transactionExecuteRawMock).toHaveBeenCalledTimes(1);
  expect(prismaExecuteRawMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the credit test and verify the new case fails**

Run:

```bash
bunx vitest run --project unit src/lib/user-credits.test.ts
```

Expected: FAIL because `grantSignupEnergy` accepts only one argument and does not use the supplied client.

- [ ] **Step 3: Add the failing transactional approval assertions**

Update the hoisted Prisma mock in `src/lib/waitlist-energy.test.ts` so it provides a transaction wrapper:

```ts
const {
  grantSignupEnergyMock,
  transactionMock,
  updateMock,
  updateManyMock,
  userFindFirstMock,
} = vi.hoisted(() => ({
  grantSignupEnergyMock: vi.fn(),
  transactionMock: vi.fn(),
  updateMock: vi.fn(),
  updateManyMock: vi.fn(),
  userFindFirstMock: vi.fn(),
}));
```

Mock Prisma with `$transaction: transactionMock`, and in `beforeEach` set:

```ts
transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
  callback({
    user: { findFirst: userFindFirstMock },
    waitlistEntry: {
      update: updateMock,
      updateMany: updateManyMock,
    },
  }),
);
```

Change the first two approval expectations to prove the grant receives the transaction client:

```ts
expect(grantSignupEnergyMock).toHaveBeenCalledWith(
  "u-linked",
  expect.objectContaining({ waitlistEntry: expect.any(Object) }),
);
expect(transactionMock).toHaveBeenCalledTimes(1);
```

Use the same second-argument assertion for the email-linking approval test.

- [ ] **Step 4: Run the waitlist energy test and verify it fails on the missing transaction path**

Run:

```bash
bunx vitest run --project unit src/lib/waitlist-energy.test.ts
```

Expected: FAIL because `approveWaitlistEntry` still calls Prisma directly and passes no transaction client.

- [ ] **Step 5: Implement an optional transaction-compatible grant client**

In `src/lib/user-credits.ts`, add a type-only Prisma import and a narrow client type:

```ts
import type { Prisma } from "@prisma/client";

type CreditDatabase = Pick<Prisma.TransactionClient, "$executeRaw">;
```

Change the private grant function to accept `database: CreditDatabase = prisma` and execute the insert through `database.$executeRaw`. Change the exported function signature to:

```ts
export async function grantSignupEnergy(
  userId: string,
  database?: CreditDatabase,
): Promise<boolean> {
  return grantEnergy(
    userId,
    getEnergyConfig().signupGrant,
    "grant:pilot",
    database,
  );
}
```

Keep `grantAdminEnergy(userId, amount)` on the singleton path. Do not alter the SQL, reason value, amount, expiration, or conflict behavior.

- [ ] **Step 6: Add the shared pending statuses and transaction implementation**

In `src/lib/waitlist.ts`, add near `WaitlistStatus`:

```ts
export const WAITLIST_PENDING_STATUSES = ["pending", "waitlisted"] as const;

export function isWaitlistPendingStatus(status: string): boolean {
  return WAITLIST_PENDING_STATUSES.includes(
    status as (typeof WAITLIST_PENDING_STATUSES)[number],
  );
}
```

Update `listPendingWaitlist` to use:

```ts
where: { status: { in: [...WAITLIST_PENDING_STATUSES] } },
```

for the `status === "pending"` branch.

Rewrite `approveWaitlistEntry` so all database work is inside one transaction:

```ts
export async function approveWaitlistEntry(
  entryId: string,
  reviewerId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const entry = await tx.waitlistEntry.update({
      data: {
        reviewedAt: new Date(),
        reviewerId,
        status: "approved",
      },
      where: { id: entryId },
      select: { email: true, linkedUserId: true },
    });

    let userId = entry.linkedUserId;
    if (!userId) {
      const email = normalizeEmail(entry.email);
      const user = email
        ? await tx.user.findFirst({
            where: { email: { equals: email, mode: "insensitive" } },
            select: { id: true },
          })
        : null;
      userId = user?.id ?? null;
      if (userId) {
        await tx.waitlistEntry.updateMany({
          data: { linkedUserId: userId },
          where: { id: entryId, linkedUserId: null },
        });
      }
    }
    if (userId) {
      await grantSignupEnergy(userId, tx);
    }
  });
  devLog("waitlist", "approve", { entryId, reviewerId });
}
```

Use the transaction client for every Prisma operation in this function. Leave `linkApprovedWaitlistOnSignup`, dev skip/reset, and rejection behavior unchanged.

- [ ] **Step 7: Run the focused credit and approval tests**

Run:

```bash
bunx vitest run --project unit src/lib/user-credits.test.ts src/lib/waitlist-energy.test.ts src/lib/waitlist.test.ts
```

Expected: all tests pass, including the existing one-time grant and waitlist parsing cases.

- [ ] **Step 8: Commit the atomic approval slice**

```bash
git add src/lib/user-credits.ts src/lib/user-credits.test.ts src/lib/waitlist.ts src/lib/waitlist-energy.test.ts src/lib/waitlist.test.ts
git commit -m "fix(waitlist): make approval grant atomic"
```

---

### Task 3: Make the user waitlist page converge and redirect

**Files:**
- Modify: `src/routes/_main.waitlist.tsx`
- Test: `src/lib/waitlist-view.test.ts` (already created in Task 1)

**Interfaces:**
- The route uses only `queryKeys.waitlistStatus` for status and own entry.
- The route uses `resolveWaitlistView` to select the approval, success, or form branch.
- Approval detected by the canonical query shows a short confirmation and then calls `router.replace('/')` once.

The submitted-with-empty-response precedence is already covered by Task 1's resolver tests; do not add a duplicate test after the implementation exists.

- [ ] **Step 1: Remove the duplicate own-only query and use the canonical query**

In `src/routes/_main.waitlist.tsx`:

1. Add `useRef` to the React imports.
2. Import `WAITLIST_PENDING_POLL_MS` and `resolveWaitlistView`.
3. Delete the local duplicate `OwnEntry` type and the entire `ownQuery` declaration.
4. Replace the `statusQuery` declaration with:

```ts
const statusQuery = useQuery({
  queryFn: fetchWaitlistStatus,
  queryKey: queryKeys.waitlistStatus,
  ...GATE_QUERY_OPTIONS,
  initialData: { status: null, own: initialOwn },
  initialDataUpdatedAt: 0,
  refetchInterval: (query) =>
    submitted
      ? WAITLIST_PENDING_POLL_MS
      : waitlistPendingPollInterval(query.state.data),
});
```

5. Derive the page state from the shared response. The local success fallback is cleared only after the first canonical query refetch finishes, so a fresh response with no own entry returns to the form rather than polling forever:

```ts
const ownStatus = statusQuery.data?.own?.status ?? null;
const isApproved = statusQuery.data?.status === "approved";
const ownIsDevSkip =
  statusQuery.data?.own?.businessName.startsWith("[dev-skip]") ?? false;
const view = resolveWaitlistView({
  effectiveStatus: statusQuery.data?.status,
  ownStatus,
  submitted,
});
const wasRejected = ownStatus === "rejected";
```

6. Replace every `ownQuery.data?.own` reference with `statusQuery.data?.own`. The form-prefill effect should depend on `statusQuery.data?.own` and retain the current localStorage-first behavior.

7. In the submit mutation's `onSuccess`, call `setSubmitted(true)` before invalidating the canonical query, then call `setSubmitted(false)` immediately after the awaited invalidation. The temporary success fallback therefore lasts until the first canonical response settles; the response itself then decides whether the page shows success, approval, rejection, or the empty form.

8. Use `statusQuery.data?.own?.id` for self-approval. Keep the existing endpoint and server authorization; remove the self-approval mutation's independent delayed `router.replace('/')` and success toast so the shared approval transition owns the single redirect/toast.

- [ ] **Step 2: Add the guarded approval transition**

In `WaitlistPage`, keep the existing wrapper `router` for the dev controls but add a stable ref immediately after it is created:

```ts
const routerRef = useRef(router);
routerRef.current = router;
const approvalHandledRef = useRef(false);
```

Add an effect after the status query derives `isApproved`:

```ts
useEffect(() => {
  if (!isApproved || approvalHandledRef.current) {
    return;
  }
  approvalHandledRef.current = true;
  toast.success("Pendaftaran disetujui. Mengalihkan ke beranda...");
  const timer = window.setTimeout(() => {
    routerRef.current.replace("/");
  }, 900);
  return () => window.clearTimeout(timer);
}, [isApproved]);
```

The stable ref is intentional: the compatibility `useRouter()` wrapper returns a new facade object on render, so putting that facade directly in the effect dependencies could cancel the timer during an unrelated render.

- [ ] **Step 3: Add the approval confirmation branch and use the resolver**

Before the existing `if (submitted || stillPending)` branch:

```tsx
if (view === "approval") {
  return <ApprovalScreen />;
}
```

Replace the old `stillPending` branch condition with:

```tsx
if (view === "success") {
  return (
    <SuccessScreen
      businessName={
        form.values.businessName || statusQuery.data?.own?.businessName || ""
      }
      email={session?.user?.email ?? undefined}
      entryId={statusQuery.data?.own?.id}
      isAdmin={isAdmin}
      isApproving={adminSelfApproveMutation.isPending}
      onAdminApprove={() => adminSelfApproveMutation.mutate()}
    />
  );
}
```

This makes an approved or rejected server response win over `submitted`.

Add this small component beside `SuccessScreen`:

```tsx
function ApprovalScreen() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-spacing-5 px-spacing-6 py-spacing-14 text-center text-surface-warm-white">
      <div className="flex size-14 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
        <Check className="size-7" strokeWidth={2.5} />
      </div>
      <h1 className="text-heading-xl font-semibold tracking-tight">
        Pendaftaran disetujui!
      </h1>
      <p className="max-w-md text-sm text-surface-warm-white/60">
        Mengalihkan kamu ke beranda untuk mulai membuat website.
      </p>
    </div>
  );
}
```

Keep the existing `SuccessScreen` copy, `Lihat beranda` link, dev skip screen, rejection banner, and form unchanged except for data-source references.

- [ ] **Step 4: Run the waitlist state tests and the nearest route-adjacent tests**

Run:

```bash
bunx vitest run --project unit src/lib/waitlist-view.test.ts src/lib/query-client.test.ts src/routes/-api.user.waitlist.test.ts
```

Expected: all tests pass. The route module itself may not have a component test harness; the pure resolver plus the manual browser smoke in Task 6 covers the branch behavior.

- [ ] **Step 5: Search for the removed duplicate observer**

Run:

```bash
rg -n 'user.*waitlist.*own|ownQuery|stillPending' src/routes/_main.waitlist.tsx src/lib/query-client.ts
```

Expected: no `ownQuery` or old own-only query remains in the waitlist page; no unrelated file is changed to compensate.

- [ ] **Step 6: Commit the user convergence slice**

```bash
git add src/routes/_main.waitlist.tsx src/lib/waitlist-view.ts src/lib/waitlist-view.test.ts
 git commit -m "fix(waitlist): redirect after live approval"
```

---

### Task 4: Make the admin surfaces refresh consistently

**Files:**
- Modify: `src/routes/_main.admin.waitlist.tsx`
- Modify: `src/components/admin/AdminShell.tsx`
- Modify: `src/routes/_main.admin.index.lazy.tsx`
- Modify: `src/routes/api.admin.nav-counts.ts`
- Modify: `src/routes/api.admin.overview.ts`
- Modify: `src/lib/waitlist.ts`
- Test: `src/routes/-api.admin.waitlist.test.ts`
- Test: `src/lib/query-client.test.ts` (already created in Task 1)
- Test: `src/lib/waitlist.test.ts`

**Interfaces:**
- Admin queue query key is `[...queryKeys.adminWaitlist, status]` and polls at `ADMIN_WAITLIST_POLL_MS`.
- Admin summary queries use `queryKeys.adminNavCounts` and `queryKeys.adminOverview` and poll at `ADMIN_SUMMARY_POLL_MS`.
- Successful admin mutations await `invalidateAdminWaitlistData(queryClient)`.
- All admin pending counts use `WAITLIST_PENDING_STATUSES`.

- [ ] **Step 1: Add the pending-status helper tests**

Extend `src/lib/waitlist.test.ts` imports and tests:

```ts
import {
  isWaitlistPendingStatus,
  WAITLIST_PENDING_STATUSES,
} from "@/lib/waitlist/waitlist";

it("defines the same pending set used by admin work queues", () => {
  expect(WAITLIST_PENDING_STATUSES).toEqual(["pending", "waitlisted"]);
  expect(isWaitlistPendingStatus("pending")).toBe(true);
  expect(isWaitlistPendingStatus("waitlisted")).toBe(true);
  expect(isWaitlistPendingStatus("approved")).toBe(false);
  expect(isWaitlistPendingStatus("rejected")).toBe(false);
});
```

- [ ] **Step 2: Run the pending-status test and verify it fails**

Run:

```bash
bunx vitest run --project unit src/lib/waitlist.test.ts
```

Expected: FAIL because the shared status set/helper is not implemented yet.

- [ ] **Step 3: Add the admin endpoint regression tests**

Create `src/routes/-api.admin.waitlist.test.ts` using the existing route-handler pattern:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  approveWaitlistEntryMock,
  findUniqueMock,
  rejectWaitlistEntryMock,
  requireAdminMock,
  sendAcceptedMock,
  sendRejectedMock,
} = vi.hoisted(() => ({
  approveWaitlistEntryMock: vi.fn(),
  findUniqueMock: vi.fn(),
  rejectWaitlistEntryMock: vi.fn(),
  requireAdminMock: vi.fn(),
  sendAcceptedMock: vi.fn(),
  sendRejectedMock: vi.fn(),
}));

vi.mock("@/lib/auth/auth-admin", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/email/templates", () => ({
  sendWaitlistAccepted: sendAcceptedMock,
  sendWaitlistRejected: sendRejectedMock,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { waitlistEntry: { findUnique: findUniqueMock } },
}));
vi.mock("@/lib/waitlist/waitlist", () => ({
  approveWaitlistEntry: approveWaitlistEntryMock,
  listPendingWaitlist: vi.fn(),
  rejectWaitlistEntry: rejectWaitlistEntryMock,
}));

import { getHandler } from "../../tests/routes/_handler";
import { Route } from "@/routes/api.admin.waitlist";

const POST = getHandler(
  Route as never as Parameters<typeof getHandler>[0],
  "POST",
);

describe("admin waitlist decisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({
      ok: true,
      admin: { userId: "admin-1" },
    });
    approveWaitlistEntryMock.mockResolvedValue(undefined);
    rejectWaitlistEntryMock.mockResolvedValue(undefined);
    findUniqueMock.mockResolvedValue({
      businessName: "Toko Budi",
      email: "budi@example.com",
    });
    sendAcceptedMock.mockResolvedValue(undefined);
    sendRejectedMock.mockResolvedValue(undefined);
  });

  it("approves through the protected service and returns approved", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/waitlist", {
        method: "POST",
        body: JSON.stringify({ action: "approve", entryId: "entry-1" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "approved" });
    expect(approveWaitlistEntryMock).toHaveBeenCalledWith("entry-1", "admin-1");
  });

  it("rejects through the protected service and returns rejected", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/waitlist", {
        method: "POST",
        body: JSON.stringify({
          action: "reject",
          entryId: "entry-1",
          reason: "Data belum cukup.",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "rejected" });
    expect(rejectWaitlistEntryMock).toHaveBeenCalledWith(
      "entry-1",
      "admin-1",
      "Data belum cukup.",
    );
  });
});
```

- [ ] **Step 4: Run the endpoint tests and verify the new file fails only because the mock/route contract needs the existing handler wiring**

Run:

```bash
bunx vitest run --project unit src/routes/-api.admin.waitlist.test.ts
```

Expected: the test file initially fails if the mocked route dependencies or handler extraction need adjustment. Fix test setup only until it reaches assertions against the existing route behavior; do not change production code to satisfy a mock mismatch.

- [ ] **Step 5: Implement shared pending status usage**

In `src/lib/waitlist.ts`, implement the constants/helper from Step 2 and use the array spread in `listPendingWaitlist`.

In `src/routes/api.admin.nav-counts.ts`, import `WAITLIST_PENDING_STATUSES` and change the count where clause to:

```ts
where: { status: { in: [...WAITLIST_PENDING_STATUSES] } },
```

In `src/routes/api.admin.overview.ts`, import the same constant and use the same where clause for both `waitlistPending` and `recentWaitlist`.

- [ ] **Step 6: Implement admin queue polling and shared invalidation**

In `src/routes/_main.admin.waitlist.tsx`:

1. Import `ADMIN_WAITLIST_POLL_MS`, `invalidateAdminWaitlistData`, and `queryKeys` from `@/lib/query-client`.
2. Change the query to:

```ts
const { data } = useQuery({
  queryFn: () =>
    fetchJson<{ entries: AdminEntry[] }>(
      `/api/admin/waitlist?status=${status}`,
    ),
  queryKey: [...queryKeys.adminWaitlist, status],
  initialData:
    status === "pending" ? { entries: initial.entries } : undefined,
  refetchInterval: ADMIN_WAITLIST_POLL_MS,
  refetchOnReconnect: true,
  refetchOnWindowFocus: true,
});
```

3. Make `onSuccess` async and await the shared helper:

```ts
onSuccess: async (_data, vars) => {
  await invalidateAdminWaitlistData(queryClient);
  toast.success(vars.action === "approve" ? "Disetujui." : "Ditolak.");
},
```

4. In each row, derive the action-specific loading copy from `act.variables?.entryId` and `act.variables?.action`, while preserving the current disabled behavior:

```tsx
const rowActionPending = act.isPending && act.variables?.entryId === entry.id;
```

Use `Menyetujui...` or `Menolak...` only for the active row; leave other disabled rows labeled `Setujui`/`Tolak`.

- [ ] **Step 7: Implement summary query keys and polling**

In `src/components/admin/AdminShell.tsx`, import `ADMIN_SUMMARY_POLL_MS` and `queryKeys`, then configure:

```ts
const q = useQuery({
  queryFn: () => fetchJson<AdminNavCounts>("/api/admin/nav-counts"),
  queryKey: queryKeys.adminNavCounts,
  refetchInterval: ADMIN_SUMMARY_POLL_MS,
  refetchOnReconnect: true,
  refetchOnWindowFocus: true,
});
```

In `src/routes/_main.admin.index.lazy.tsx`, import the same interval and keys and configure:

```ts
const { data } = useQuery({
  queryFn: () => fetchJson<OverviewData>("/api/admin/overview"),
  queryKey: queryKeys.adminOverview,
  refetchInterval: ADMIN_SUMMARY_POLL_MS,
  refetchOnReconnect: true,
  refetchOnWindowFocus: true,
});
```

- [ ] **Step 8: Run all focused admin tests**

Run:

```bash
bunx vitest run --project unit \
  src/lib/query-client.test.ts \
  src/lib/waitlist.test.ts \
  src/routes/-api.admin.waitlist.test.ts \
  src/routes/-api.user.waitlist.test.ts \
  src/components/admin/admin-status.test.ts
```

Expected: all tests pass. Existing admin-status behavior must remain green.

- [ ] **Step 9: Commit the admin consistency slice**

```bash
git add src/routes/_main.admin.waitlist.tsx src/components/admin/AdminShell.tsx src/routes/_main.admin.index.lazy.tsx src/routes/api.admin.nav-counts.ts src/routes/api.admin.overview.ts src/lib/waitlist.ts src/lib/waitlist.test.ts src/routes/-api.admin.waitlist.test.ts src/lib/query-client.test.ts
git commit -m "fix(admin): refresh waitlist surfaces consistently"
```

---

### Task 5: Add real database coverage and update developer documentation

**Files:**
- Create: `tests/integration/waitlist-approval.itest.ts`
- Modify: `DEV.md`

**Interfaces:**
- Integration coverage calls the real `approveWaitlistEntry` service and observes PostgreSQL state.
- Documentation states that the canonical waitlist query polls pending users every 15 seconds and admin surfaces refresh at bounded intervals plus focus/reconnect.

- [ ] **Step 1: Create the failing integration test**

Create `tests/integration/waitlist-approval.itest.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { invalidateSettingCache, primeSettingCache } from "@/lib/config/app-settings";
import { approveWaitlistEntry } from "@/lib/waitlist/waitlist";
import { prisma } from "./setup";

const STORY =
  "Jualan makanan rumahan sejak 2024 dan membutuhkan website agar pelanggan mudah melihat menu serta menghubungi usaha.";

describe("waitlist approval transaction", () => {
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "UserCredit", "Payment", "User" RESTART IDENTITY CASCADE`,
    );
    invalidateSettingCache();
  });

  afterAll(() => prisma.$disconnect());

  it("commits approval and exactly one pilot grant across retries", async () => {
    const user = await prisma.user.create({
      data: { email: `approval-${crypto.randomUUID()}@example.test` },
    });
    const entry = await prisma.waitlistEntry.create({
      data: {
        businessName: "Warung Uji",
        email: user.email ?? "",
        linkedUserId: user.id,
        status: "pending",
        story: STORY,
      },
    });

    await approveWaitlistEntry(entry.id, "admin-test");
    await approveWaitlistEntry(entry.id, "admin-test");

    const saved = await prisma.waitlistEntry.findUnique({
      where: { id: entry.id },
      select: { status: true },
    });
    const grants = await prisma.userCredit.count({
      where: { reason: "grant:pilot", userId: user.id },
    });

    expect(saved?.status).toBe("approved");
    expect(grants).toBe(1);
  });

  it("rolls approval back when the transactional grant cannot fit the credit column", async () => {
    const user = await prisma.user.create({
      data: { email: `rollback-${crypto.randomUUID()}@example.test` },
    });
    const entry = await prisma.waitlistEntry.create({
      data: {
        businessName: "Warung Rollback",
        email: user.email ?? "",
        linkedUserId: user.id,
        status: "pending",
        story: STORY,
      },
    });

    await prisma.appSetting.upsert({
      where: { key: "economics.signup_energy_grant" },
      create: {
        category: "economics",
        key: "economics.signup_energy_grant",
        value: 2_147_483_648,
      },
      update: { value: 2_147_483_648 },
    });
    await primeSettingCache({ force: true });

    try {
      await expect(
        approveWaitlistEntry(entry.id, "admin-test"),
      ).rejects.toThrow();
    } finally {
      await prisma.appSetting.delete({
        where: { key: "economics.signup_energy_grant" },
      });
      invalidateSettingCache();
    }

    const saved = await prisma.waitlistEntry.findUnique({
      where: { id: entry.id },
      select: { status: true },
    });
    expect(saved?.status).toBe("pending");

  });
});
```

- [ ] **Step 2: Run the integration file and record the environment result**

Run:

```bash
bunx vitest run --project integration tests/integration/waitlist-approval.itest.ts
```

Expected with PostgreSQL running: the initial run fails if the transaction implementation, generated Prisma client, or test cleanup is incomplete. If PostgreSQL is unavailable, record the exact connection failure and continue with unit verification; do not weaken the test or claim integration coverage passed.

- [ ] **Step 3: Fix only integration setup or implementation defects revealed by the test**

Verify that:

- the real transaction client reaches the raw grant insert;
- repeated approval hits the partial unique pilot-grant index and still succeeds;
- the oversized grant causes the transaction to reject and leaves the waitlist status pending;
- the AppSetting row is deleted and the sync setting cache is invalidated even when the rollback assertion fails.

Do not add production fallbacks that convert a database error into approval.

- [ ] **Step 4: Update `DEV.md` client-cache documentation**

Replace the existing waitlist cache paragraph under `Client data cache (TanStack Query)` with a concise version that states:

```markdown
Gate keys such as `queryKeys.waitlistStatus` use `GATE_QUERY_OPTIONS` (10s stale, refetch on window focus + reconnect). While the user is waitlisted with a pending/waitlisted own entry, the canonical waitlist query polls every 15s and stops after approval, rejection, or no entry. After waitlist submit, admin approval/rejection, or dev waitlist changes, invalidate the shared status query so `/`, `/waitlist`, and the chrome converge without a full browser refresh. Admin waitlist, overview, and nav-count queries use bounded polling plus the same mutation invalidation; this is polling, not a WebSocket/SSE channel. Security gates remain server-owned.
```

Keep the rest of `DEV.md` unchanged.

- [ ] **Step 5: Run docs and focused checks**

Run:

```bash
bun scripts/check-doc-links.ts
bunx vitest run --project unit src/lib/waitlist-view.test.ts src/lib/query-client.test.ts src/lib/user-credits.test.ts src/lib/waitlist-energy.test.ts src/lib/waitlist.test.ts src/routes/-api.admin.waitlist.test.ts src/routes/-api.user.waitlist.test.ts
```

Expected: docs check exits 0 and every listed unit suite passes.

- [ ] **Step 6: Commit integration coverage and docs**

```bash
git add tests/integration/waitlist-approval.itest.ts DEV.md
git commit -m "test(waitlist): cover approval transaction and live refresh"
```

---

### Task 6: Full verification, review, and release preparation

**Files:**
- No planned production-file additions. Inspect all files from Tasks 1–5.
- Do not stage or modify unrelated dirty files.

- [ ] **Step 1: Review the plan against the final diff**

Run:

```bash
git status --short --untracked-files=all
git diff --stat HEAD~5..HEAD
git diff --check HEAD~5..HEAD
```

Confirm that only the spec/plan and waitlist implementation/test/doc files are part of this work. If `HEAD~5` is not the correct start because a task needed an extra commit, use `git merge-base e88d22ce HEAD` instead. Do not include unrelated pre-existing changes.

- [ ] **Step 2: Run the full local quality gate**

Run:

```bash
bun run check
```

Expected: exit 0 with lock, format, lint, typecheck, changed tests, Knip, and docs checks green. If it fails, fix the smallest root cause, rerun the nearest focused test, then rerun `bun run check`.

- [ ] **Step 3: Run the full unit suite**

Run:

```bash
bun run test:full
```

Expected: exit 0 with zero failed tests.

- [ ] **Step 4: Run integration verification when infrastructure is available**

Run:

```bash
bun run test:integration
```

Expected with local PostgreSQL: exit 0. If infrastructure is unavailable, report that exact limitation and do not represent integration coverage as passed.

- [ ] **Step 5: Run the manual browser smoke checks**

Use two authenticated browser sessions against the running app and execute the seven checks in the spec. Record observed behavior and any failures in the handoff; do not use a full reload to make a check pass.

- [ ] **Step 6: Inspect the staged file boundary**

Run:

```bash
git diff --name-only e88d22ce..HEAD
```

Expected: no `.env`, logs, screenshots, generated junk, graph output, or unrelated user changes.

- [ ] **Step 7: Request a read-only code review before release**

Use `scripts/review-package` with base `e88d22ce` and the current `HEAD`, then review the package against:

- canonical query used everywhere;
- no unauthorized client gate change;
- approval/rejection precedence over local submitted state;
- active invalidation of all four query roots;
- transaction rollback and idempotent grant;
- no fabricated success or swallowed mutation error;
- shared pending counts;
- tests and docs present.

Fix every Critical or Important issue and rerun the covering tests plus `bun run check`.

- [ ] **Step 8: Commit any review fixes with a Conventional Commit**

Use a focused `fix(waitlist): ...` or `fix(admin): ...` message. Never amend unrelated commits or stage unrelated files.

- [ ] **Step 9: Follow release workflow only after fresh green evidence**

Read and follow `.agents/skills/push-dev/SKILL.md`, then `.agents/skills/push-main/SKILL.md` exactly:

1. `bun run check` is green.
2. Commit all intended changes on `dev`.
3. Push `dev` and wait for CI to finish green.
4. Check out `main`, pull, merge `dev`, run `bun run check` on the merge result.
5. Push `main` and block on the newest main CI run with `gh run watch --exit-status`.
6. If CI fails, read the failing log before making a minimal fix and repeat the required verification.
7. Return the local checkout to `dev`.

- [ ] **Step 10: Final evidence report**

Report only fresh evidence: commit SHAs, focused test counts, `bun run check` exit status, integration status, browser smoke status, CI run status, and the final branch. Do not say “perfect” or “no risk”; state any remaining limitation explicitly.

---

## Plan self-review

- **Spec coverage:** canonical cache (Task 1/3), bounded polling (Tasks 1/4), shared invalidation (Tasks 1/4), approval/rejection precedence (Tasks 1/3), admin counts (Task 4), atomic grant (Task 2/5), tests (Tasks 1–5), docs (Task 5), release gates (Task 6).
- **Placeholder scan:** no `TBD`, `TODO`, or unspecified implementation step is required; every task has exact files, commands, expected outcomes, and code contracts.
- **Type consistency:** `queryKeys.adminWaitlist` remains a base readonly tuple and status queries spread it; `WaitlistStatusResponse.own` matches the route's loader-provided own-entry fields; `grantSignupEnergy` accepts the transaction-compatible client used by `approveWaitlistEntry`; the invalidation helper uses the three admin roots plus `waitlistStatus`.
- **Scope check:** the work is one bounded waitlist subsystem change. No independent subsystem is hidden in the plan; the transaction change is directly required to prevent an approval partial-commit failure.
