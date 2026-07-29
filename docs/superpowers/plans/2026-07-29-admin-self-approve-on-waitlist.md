# Admin self-approve on /waitlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin self-approve their own waitlist entry with one click from the post-submit "Terima kasih" view on `/waitlist`, without weakening any existing access controls.

**Architecture:** Add a new `useMutation` (`adminSelfApproveMutation`) that calls the existing `/api/admin/waitlist` POST endpoint with `{ action: "approve", entryId: <admin's own entry id from loader> }`. Render a single button inside `SuccessScreen` when `isAdmin === true` and `own?.id` is present. The endpoint's existing `requireAdmin()` is the only authorization gate — no new server code.

**Tech Stack:** TanStack Start, TanStack Query, React, existing toast + fetchJson helpers.

## Global Constraints

- Indonesian copy only on user-facing strings; English on logs/code/comments.
- Existing `requireAdmin()` is the sole authorization — never trust the UI gate.
- No new env vars, no new endpoints, no DB migrations.
- `entryId` must always be sourced from `Route.useLoaderData().own.id` — never from user input, URL, or another user's row.
- One commit per task; push via `push-dev` after final task.
- Tests live next to source; follow the existing colocated `*.test.ts` pattern.

---

### Task 1: Failing test for admin self-approve button visibility

**Files:**
- Modify: `src/routes/_main.waitlist.test.ts` (create if absent; the route is currently untested at this granularity — check first)

**Interfaces:**
- Consumes: existing route at `src/routes/_main.waitlist.tsx`, existing `gateIfApproved` loader at lines 40-65 of that file.
- Produces: a test asserting `SuccessScreen` (rendered when `submitted || stillPending`) contains the admin self-approve button only when `isAdmin === true` AND `own.id` is present.

- [ ] **Step 1: Check whether a test file exists for the route**

Run: `ls src/routes/_main.waitlist.test.ts`
Expected: either exists or "No such file".

- [ ] **Step 2: Create the test file with the failing assertions**

If absent, create `src/routes/_main.waitlist.test.ts` with the following. Adapt imports to match the project's existing test setup — check `src/routes/_main.waitlist.tsx` for the export shape (`Route`, `WaitlistPage`) and a colocated test file in the same directory for import conventions.

```ts
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryHistory } from "@tanstack/react-router";

// Tests verify that the post-submit "Terima kasih" view renders an admin
// self-approve button only for admins with their own entry id present.
// The button calls /api/admin/waitlist with { action: "approve", entryId }.
// Server-side authorization is the existing requireAdmin() check — this
// test only covers the UI gate.

describe("Waitlist SuccessScreen admin self-approve", () => {
  it("hides the admin self-approve button for non-admins", () => {
    // Render with isAdmin=false, own={status: "pending", id: "x"}
    // Assert: button with text "Setujui saya (admin bypass)" is absent
  });

  it("shows the admin self-approve button for admins with a pending entry", () => {
    // Render with isAdmin=true, own={status: "pending", id: "x"}
    // Assert: button with text "Setujui saya (admin bypass)" is present
  });

  it("hides the admin self-approve button when admin has no own entry", () => {
    // Render with isAdmin=true, own=null
    // Assert: button absent
  });
});
```

If a route-test harness is already wired (look for `createRouter`/`renderWithRouter` patterns in adjacent `*.test.tsx` files), use that. Otherwise stub `SuccessScreen` props directly via React Testing Library, mocking `Route.useLoaderData` and `useSession`.

- [ ] **Step 3: Run the test, confirm it fails for the right reason**

Run: `bun run test -- src/routes/_main.waitlist.test.ts 2>&1 | tail -30`
Expected: FAIL with "unable to find element" (button doesn't exist yet).

- [ ] **Step 4: Commit the failing test**

```bash
git add src/routes/_main.waitlist.test.ts
git commit -m "test(waitlist): cover admin self-approve button visibility"
```

---

### Task 2: Add adminSelfApproveMutation to the page

**Files:**
- Modify: `src/routes/_main.waitlist.tsx:158-355` (inside `WaitlistPage` component)

**Interfaces:**
- Consumes: `Route.useLoaderData()` returns `{ own: OwnEntry | null, isAdmin: boolean }`. Existing `useMutation` pattern from `devSkipMutation` at lines 333-355 of the same file. Existing `queryKeys.waitlistStatus` and `router.replace("/")` pattern.
- Produces: a new `adminSelfApproveMutation` that POSTs to `/api/admin/waitlist` with `{ action: "approve", entryId: own.id }` and on success invalidates the waitlist status query, then `router.replace("/")`.

- [ ] **Step 1: Locate `devSkipMutation` and copy its structure**

In `src/routes/_main.waitlist.tsx` around line 333, copy the `devSkipMutation` shape but change the endpoint and body:

```tsx
const adminSelfApproveMutation = useMutation({
  mutationFn: async () => {
    if (!own?.id) {
      throw new Error("Tidak ada pendaftaran yang bisa disetujui.");
    }
    return fetchJson<{ status?: string }>("/api/admin/waitlist", {
      method: "POST",
      body: JSON.stringify({ action: "approve", entryId: own.id }),
    });
  },
  onSuccess: async () => {
    toast.success("Pendaftaran disetujui (admin bypass).");
    await queryClient.invalidateQueries({
      queryKey: queryKeys.waitlistStatus,
    });
    setTimeout(() => router.replace("/"), 1500);
  },
  onError: (error) => {
    toast.error(
      error instanceof Error
        ? error.message
        : "Gagal menyetujui pendaftaran.",
    );
  },
});
```

Place it directly after `devSkipMutation` (around line 355). Use the same `fetchJson` import already at the top of the file. `own` is sourced from the loader on line 158.

- [ ] **Step 2: Verify the mutation is reachable in dev mode**

Run: `bun run check 2>&1 | tail -15`
Expected: format/lint/typecheck/test/knip/docs all green. The mutation isn't yet wired to UI, but it must typecheck.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_main.waitlist.tsx
git commit -m "feat(waitlist): add adminSelfApproveMutation on /waitlist page"
```

---

### Task 3: Render the admin button inside SuccessScreen

**Files:**
- Modify: `src/routes/_main.waitlist.tsx` — `SuccessScreen` props (line 1000-1029) and call site (line 401-410)

**Interfaces:**
- Consumes: `adminSelfApproveMutation` from Task 2; `isAdmin: boolean`; `entryId: string | undefined`.
- Produces: `SuccessScreen` renders a "Setujui saya (admin bypass)" button below the thank-you text when `isAdmin && entryId`; clicking calls `adminSelfApproveMutation.mutate()`; while pending shows "Menyetujui…".

- [ ] **Step 1: Update the `SuccessScreen` props and add the button**

Modify the `SuccessScreen` signature (around line 1000) to accept `isAdmin` and `entryId`:

```tsx
function SuccessScreen({
  businessName,
  email,
  isAdmin,
  entryId,
  onAdminApprove,
  isApproving,
}: {
  businessName: string;
  email?: string;
  isAdmin: boolean;
  entryId?: string;
  onAdminApprove: () => void;
  isApproving: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-spacing-5 px-spacing-6 py-spacing-14 text-center text-surface-warm-white">
      <div className="flex size-14 items-center justify-center rounded-full border border-aurora-orange/30 bg-aurora-orange/10 text-aurora-orange">
        <Check className="size-7" strokeWidth={2.5} />
      </div>
      <h1 className="text-heading-xl font-semibold tracking-tight">
        Terima kasih, {businessName || "kamu"}!
      </h1>
      <p className="max-w-md text-sm text-surface-warm-white/60">
        Pendaftaran kamu sudah kami terima. Tim kami akan menghubungi lewat
        {email ? (
          <>
            {" "}
            email <span className="text-surface-warm-white/80">{email}</span>
          </>
        ) : (
          " email"
        )}{" "}
        setelah kami cek.
      </p>
      {isAdmin && entryId ? (
        <button
          className="mt-spacing-4 text-xs text-surface-warm-white/60 underline-offset-4 hover:text-surface-warm-white hover:underline disabled:opacity-50"
          disabled={isApproving}
          onClick={onAdminApprove}
          type="button"
        >
          {isApproving ? "Menyetujui..." : "Setujui saya (admin bypass)"}
        </button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Update the call site**

In `WaitlistPage` around line 401-410, pass the new props:

```tsx
if (submitted || stillPending) {
  return (
    <SuccessScreen
      businessName={
        form.values.businessName || ownQuery.data?.own?.businessName || ""
      }
      email={session?.user?.email ?? undefined}
      isAdmin={isAdmin}
      entryId={initialOwn?.id ?? ownQuery.data?.own?.id ?? undefined}
      onAdminApprove={() => adminSelfApproveMutation.mutate()}
      isApproving={adminSelfApproveMutation.isPending}
    />
  );
}
```

Note: prefer `initialOwn.id` (from the loader) when present; fall back to `ownQuery.data.own.id` if the query has refreshed and the loader's data is stale. Both are server-trusted; neither accepts user input.

- [ ] **Step 3: Run the failing test from Task 1, confirm it passes**

Run: `bun run test -- src/routes/_main.waitlist.test.ts 2>&1 | tail -30`
Expected: all three assertions PASS.

- [ ] **Step 4: Run full check**

Run: `bun run check 2>&1 | tail -15`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_main.waitlist.tsx
git commit -m "feat(waitlist): render admin self-approve button on post-submit view"
```

---

### Task 4: Manual smoke test, then push

**Files:** none (verification only)

**Interfaces:** none — this task verifies the previous three.

- [ ] **Step 1: Boot the dev server and verify the flow**

Run: `bun run dev` in one terminal.

Then in a browser at `https://dev.umkmcepat.com/waitlist` signed in as an admin (email in `ADMIN_EMAILS`):
- Submit the waitlist form. Expect "Terima kasih" screen.
- Confirm the "Setujui saya (admin bypass)" button appears below the thank-you text.
- Click it. Expect a success toast, then redirect to `/` within ~1.5s.
- Land on `/` — should NOT redirect back to `/waitlist`.

- [ ] **Step 2: Verify non-admin isolation**

In another browser session as a non-admin (different email NOT in `ADMIN_EMAILS`):
- Submit the waitlist form. Expect "Terima kasih" screen.
- Confirm the admin button is NOT visible.

- [ ] **Step 3: Verify server-side rejection**

Using `curl` with a session cookie for the non-admin user, POST to `/api/admin/waitlist`:

```bash
curl -X POST https://dev.umkmcepat.com/api/admin/waitlist \
  -H "Content-Type: application/json" \
  -b "session=<non-admin-cookie>" \
  -d '{"action":"approve","entryId":"<some-id>"}'
```

Expected: `403 Permintaan ditolak.` (or equivalent non-200). This confirms `requireAdmin()` rejects non-admin POSTs regardless of UI state.

- [ ] **Step 4: Push to dev and watch CI**

```bash
git push origin dev
```

Wait for CI to be green before proceeding.

- [ ] **Step 5: Merge to main and push**

Merge `dev` into `main`, push `main`, watch CI green, return to `dev`. Use the `push-dev` / `push-main` skills.
