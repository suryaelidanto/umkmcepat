# Waitlist Admin UI + Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the missing admin dashboard UI to review/approve/decline waitlist submissions; wire the `WAITLIST_ENABLED` env toggle into the gate (replacing the implicit `NODE_ENV` prod/dev branch); and let a rejected user pre-fill + resend their last submission. The backend domain logic stays unchanged.

**Architecture:** A new `_main.admin.tsx` page consumes the existing `/api/admin/waitlist` API (GET list-pending + POST approve/reject). The `api.user.waitlist` GET replaces its `NODE_ENV` branch with a `WAITLIST_ENABLED` check (false → returns `approved` for everyone signed-in = pass-through gate; true → behaves as today; unset → true fail-safe). A new own-entry pre-fill (extend `api.user.waitlist` to return the user's fields, or a sibling endpoint) feeds the waitlist page form. `submitWaitlist`/`approveWaitlistEntry`/`rejectWaitlistEntry`/`requireAdmin`/`linkApprovedWaitlistOnSignup` are untouched.

**Tech Stack:** Bun, TypeScript, TanStack Router (`createFileRoute` + `_main.*` convention), TanStack Query (`useQuery`), Prisma + PostgreSQL, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-25-waitlist-admin-design.md`
**Env:** `WAITLIST_ENABLED` already declared in `.env`/`.env.example` (committed `28fe5ed`).

## Global Constraints

- Backend domain logic stays unchanged: `submitWaitlist`, `approveWaitlistEntry`, `rejectWaitlistEntry`, `requireAdmin`, `linkApprovedWaitlistOnSignup`, status transitions. Only the gate's pass-through branch + the admin UI + the own-entry pre-fill are new.
- `WAITLIST_ENABLED` code default when unset = `true` (fail-safe: over-gate rather than let everyone through). Prod/dev difference is the env *value*, not a `NODE_ENV` branch.
- Admin role = `ADMIN_EMAILS` env-allowlist (no DB `role` column). `requireAdmin()` reused as-is.
- When `WAITLIST_ENABLED=false`, the gate is pass-through but `POST /api/waitlist` submissions are still accepted/stored (accumulate for a later launch). The toggle only controls the onboarding gate.
- Visible product copy Indonesian; code/comments/errors English. Empty states are honest, no fabricated content.
- `.env`/`.env.example` stay 1:1 (already verified after `28fe5ed`).
- TDD: failing test first, minimal code, targeted test, then `bun run check`. Frequent atomic commits to `dev`. Conventional-commit messages, body lines ≤ 100 chars, end with `Co-Authored-By: Claude <noreply@anthropic.com>`.

---

## File Structure

- **Create** `src/lib/waitlist-enabled.ts` — `isWaitlistEnabled(): boolean` reads `WAITLIST_ENABLED`, default `true`.
- **Create** `src/lib/waitlist-enabled.test.ts` — toggle parsing (true/false/unset/invalid → fail-safe true).
- **Create** `src/lib/waitlist-own-entry.ts` — `getOwnWaitlistEntry(email): Promise<OwnEntry|null>` returning the signed-in user's fields for pre-fill (reuses `prisma.waitlistEntry.findUnique`).
- **Create** `src/lib/waitlist-own-entry.test.ts` — returns fields / null.
- **Modify** `src/routes/api.user.waitlist.ts` — replace the `NODE_ENV` branch with `isWaitlistEnabled()`; when off, return `{status:"approved"}` (pass-through) + include the own-entry fields for pre-fill.
- **Modify** `src/routes/api.user.waitlist.test.ts` (or create) — toggle off → pass-through; toggle on + null entry → gates; admin → approved.
- **Create** `src/routes/_main.admin.tsx` — the admin dashboard page (server `requireAdmin()` + client list/approve/decline UI).
- **Create** `src/stories/AdminWaitlist.stories.tsx` — dashboard list states (pending/empty/approve/decline).
- **Modify** `src/routes/_main.waitlist.tsx` — fetch own-entry on mount, pre-fill the form + show existing image thumbnail + "Ganti gambar" affordance.

---

### Task 1: WAITLIST_ENABLED toggle helper

**Files:**
- Create: `src/lib/waitlist-enabled.ts`
- Create: `src/lib/waitlist-enabled.test.ts`

**Interfaces:**
- Produces: `isWaitlistEnabled(): boolean` — reads `process.env.WAITLIST_ENABLED`; `"false"` (case-insensitive) → `false`; anything else (including unset/empty/invalid) → `true` (fail-safe).

- [ ] **Step 1: Write the failing test**

Create `src/lib/waitlist-enabled.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";

import { isWaitlistEnabled } from "@/lib/waitlist-enabled";

describe("isWaitlistEnabled", () => {
  const original = process.env.WAITLIST_ENABLED;
  afterEach(() => {
    if (original === undefined) {
      delete process.env.WAITLIST_ENABLED;
    } else {
      process.env.WAITLIST_ENABLED = original;
    }
  });

  it("returns true when set to 'true'", () => {
    process.env.WAITLIST_ENABLED = "true";
    expect(isWaitlistEnabled()).toBe(true);
  });

  it("returns false only when set to 'false' (case-insensitive)", () => {
    process.env.WAITLIST_ENABLED = "false";
    expect(isWaitlistEnabled()).toBe(false);
    process.env.WAITLIST_ENABLED = "FALSE";
    expect(isWaitlistEnabled()).toBe(false);
  });

  it("defaults true (fail-safe) when unset or invalid", () => {
    delete process.env.WAITLIST_ENABLED;
    expect(isWaitlistEnabled()).toBe(true);
    process.env.WAITLIST_ENABLED = "";
    expect(isWaitlistEnabled()).toBe(true);
    process.env.WAITLIST_ENABLED = "nope";
    expect(isWaitlistEnabled()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/lib/waitlist-enabled.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/lib/waitlist-enabled.ts`:

```ts
// Waitlist onboarding gate. false = pass-through (signed-in users skip the
// gate). Unset/invalid defaults true (fail-safe: over-gate rather than
// accidentally let everyone through). Prod/dev is the env value, not NODE_ENV.
export function isWaitlistEnabled(): boolean {
  return process.env.WAITLIST_ENABLED?.toLowerCase() !== "false";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/lib/waitlist-enabled.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/waitlist-enabled.ts src/lib/waitlist-enabled.test.ts
git commit -m "feat(waitlist): isWaitlistEnabled toggle (unset defaults true)"
```

---

### Task 2: Own-entry pre-fill helper

**Files:**
- Create: `src/lib/waitlist-own-entry.ts`
- Create: `src/lib/waitlist-own-entry.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`, `normalizeEmail` from `@/lib/waitlist`.
- Produces: `getOwnWaitlistEntry(email): Promise<OwnEntry | null>` where `OwnEntry = { businessName, phone, businessType, story, imageRef, status }`. `null` when no entry or invalid email.

- [ ] **Step 1: Write the failing test**

Create `src/lib/waitlist-own-entry.test.ts` (mock `prisma.waitlistEntry.findUnique`):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getOwnWaitlistEntry } from "@/lib/waitlist-own-entry";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    waitlistEntry: {
      findUnique: vi.fn(),
    },
  },
}));

const { prisma } = await import("@/lib/prisma");

describe("getOwnWaitlistEntry", () => {
  beforeEach(() => vi.mocked(prisma.waitlistEntry.findUnique).mockReset());

  it("returns the user's own fields when an entry exists", async () => {
    vi.mocked(prisma.waitlistEntry.findUnique).mockResolvedValue({
      businessName: "Warteg Bu Sari",
      businessType: "kuliner",
      imageRef: "object:local:waitlist/x.png",
      phone: "0812",
      status: "rejected",
      story: "Jualan sejak 2019",
    });
    const entry = await getOwnWaitlistEntry("user@example.com");
    expect(entry).toMatchObject({ businessName: "Warteg Bu Sari", status: "rejected" });
  });

  it("returns null when no entry", async () => {
    vi.mocked(prisma.waitlistEntry.findUnique).mockResolvedValue(null);
    expect(await getOwnWaitlistEntry("nobody@example.com")).toBeNull();
  });

  it("returns null for an invalid email", async () => {
    expect(await getOwnWaitlistEntry("not-an-email")).toBeNull();
    expect(prisma.waitlistEntry.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/lib/waitlist-own-entry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/lib/waitlist-own-entry.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/waitlist";

export type OwnEntry = {
  businessName: string;
  businessType: string | null;
  imageRef: string | null;
  phone: string | null;
  status: string;
  story: string;
};

export async function getOwnWaitlistEntry(
  email: string,
): Promise<OwnEntry | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }
  const entry = await prisma.waitlistEntry.findUnique({
    select: {
      businessName: true,
      businessType: true,
      imageRef: true,
      phone: true,
      status: true,
      story: true,
    },
    where: { email: normalized },
  });
  return entry ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/lib/waitlist-own-entry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/waitlist-own-entry.ts src/lib/waitlist-own-entry.test.ts
git commit -m "feat(waitlist): getOwnWaitlistEntry for pre-fill on rejection"
```

---

### Task 3: Wire the toggle + own-entry into api.user.waitlist

**Files:**
- Modify: `src/routes/api.user.waitlist.ts`
- Create: `src/routes/api.user.waitlist.test.ts` (if not present; the spec references this route, add a focused test)

**Interfaces:**
- Consumes: `isWaitlistEnabled` (Task 1), `getOwnWaitlistEntry` (Task 2), `isAdminEmail` + `isWaitlistApproved` from `@/lib/waitlist`, `auth`.
- Produces: `GET /api/user/waitlist` → `{ status: "approved" | string | null, own?: OwnEntry }`. When `WAITLIST_ENABLED=false`, returns `{status:"approved"}` for signed-in non-admins (pass-through). When true, behaves as today (null gates). When unset → true (fail-safe). Always includes `own` for a signed-in user (for pre-fill) unless admin.

- [ ] **Step 1: Write the failing test**

Create `src/routes/api.user.waitlist.test.ts`. The route handler logic is testable via an extraction; mirror the `resolveMediaRedirect` pattern from the photo-upload plan — extract the decision into a pure helper:

```ts
import { describe, expect, it, vi } from "vitest";

import { resolveUserWaitlistStatus } from "@/routes/api.user.waitlist";

vi.mock("@/lib/config", () => ({ getEnv: () => "" }));

describe("resolveUserWaitlistStatus", () => {
  it("toggle off → pass-through (approved) for a signed-in non-admin", () => {
    const r = resolveUserWaitlistStatus({
      email: "user@example.com",
      isAdmin: false,
      isApproved: false,
      waitlistEnabled: false,
    });
    expect(r.status).toBe("approved");
  });

  it("toggle on + no entry → null (gates to /waitlist)", () => {
    const r = resolveUserWaitlistStatus({
      email: "user@example.com",
      isAdmin: false,
      isApproved: null,
      waitlistEnabled: true,
    });
    expect(r.status).toBeNull();
  });

  it("toggle on + approved entry → approved", () => {
    const r = resolveUserWaitlistStatus({
      email: "user@example.com",
      isAdmin: false,
      isApproved: true,
      waitlistEnabled: true,
    });
    expect(r.status).toBe("approved");
  });

  it("admin is always approved", () => {
    const r = resolveUserWaitlistStatus({
      email: "admin@example.com",
      isAdmin: true,
      isApproved: false,
      waitlistEnabled: true,
    });
    expect(r.status).toBe("approved");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/routes/api.user.waitlist.test.ts`
Expected: FAIL — `resolveUserWaitlistStatus` not exported.

- [ ] **Step 3: Refactor the route to use the toggle + own-entry**

Modify `src/routes/api.user.waitlist.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { getOwnWaitlistEntry, type OwnEntry } from "@/lib/waitlist-own-entry";
import { isAdminEmail, isWaitlistApproved } from "@/lib/waitlist";
import { isWaitlistEnabled } from "@/lib/waitlist-enabled";

type ResolveInput = {
  email: string | null;
  isAdmin: boolean;
  isApproved: boolean | null;
  waitlistEnabled: boolean;
};

export function resolveUserWaitlistStatus({
  email,
  isAdmin,
  isApproved,
  waitlistEnabled,
}: ResolveInput): { own?: OwnEntry; status: string | null } {
  if (!email) {
    return { status: null };
  }
  if (isAdmin) {
    return { status: "approved" };
  }
  if (!waitlistEnabled) {
    return { status: "approved" };
  }
  if (isApproved) {
    return { status: "approved" };
  }
  return { status: null };
}

export const Route = createFileRoute("/api/user/waitlist")({
  server: {
    handlers: {
      GET: async () => {
        const session = await auth();
        const email = session?.user?.email ?? null;
        const isAdmin = email ? isAdminEmail(email) : false;
        const waitlistEnabled = isWaitlistEnabled();
        const isApproved = email ? await isWaitlistApproved(email) : null;
        const resolved = resolveUserWaitlistStatus({
          email,
          isAdmin,
          isApproved,
          waitlistEnabled,
        });
        const own =
          email && !isAdmin ? await getOwnWaitlistEntry(email) : undefined;
        return Response.json({ ...resolved, own });
      },
    },
  },
});
```

This removes the `NODE_ENV === "production"` branch entirely (the toggle replaces it). `null` now gates when enabled + no entry; the dev-bypass comes from `WAITLIST_ENABLED="false"` in `.env`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/routes/api.user.waitlist.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Update MainChrome to carry the `own` payload (no logic change)**

The client gate in `src/components/common/MainChrome.tsx` reads `status` only — unchanged. But the waitlist page (Task 5) needs `own`, which now comes from the same endpoint. Confirm `fetchJson<{ status: string | null }>` can be widened to `fetchJson<{ status: string | null; own?: OwnEntry }>` where the page consumes it (Task 5 handles that). No MainChrome change needed here — it ignores `own`.

- [ ] **Step 6: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/routes/api.user.waitlist.ts src/routes/api.user.waitlist.test.ts
git commit -m "feat(waitlist): WAITLIST_ENABLED gate + own-entry in api.user.waitlist"
```

---

### Task 4: Admin dashboard page

**Files:**
- Create: `src/routes/_main.admin.tsx`
- Create: `src/stories/AdminWaitlist.stories.tsx`

**Interfaces:**
- Consumes: `requireAdmin` (server-side gate), `GET /api/admin/waitlist` (list-pending), `POST /api/admin/waitlist {entryId, action, reason?}`.
- Produces: `/admin` — server `requireAdmin()` 403 for non-admins; client list of pending entries with approve + decline (with reason) actions; mobile-first stacked cards, sticky bottom actions.

- [ ] **Step 1: Create the admin page**

Create `src/routes/_main.admin.tsx`:

```tsx
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { requireAdmin } from "@/lib/auth-admin";
import { listPendingWaitlist } from "@/lib/waitlist";
import { fetchJson } from "@/lib/fetch-json";

type PendingEntry = {
  id: string;
  businessName: string;
  businessType: string | null;
  imageRef: string | null;
  phone: string | null;
  status: string;
  story: string;
  submittedAt: string;
};

export const Route = createFileRoute("/_main/admin")({
  server: {
    // Server-side gate: non-admins get 403 before the page renders.
    beforeLoad: async () => {
      const admin = await requireAdmin();
      if (!admin.ok) {
        throw new Response(null, { status: admin.status });
      }
    },
  },
  // Preload the pending list server-side so the page renders populated.
  loader: async () => {
    const entries = await listPendingWaitlist();
    return { entries };
  },
  component: AdminPage,
});

function AdminPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { entries: initial } = Route.useLoaderData();
  const { data } = useQuery({
    queryFn: () => fetchJson<{ entries: PendingEntry[] }>("/api/admin/waitlist"),
    queryKey: ["admin", "waitlist"],
    initialData: { entries: initial },
  });

  const act = useMutation({
    mutationFn: async (vars: { action: string; entryId: string; reason?: string }) =>
      fetchJson(`/api/admin/waitlist`, {
        method: "POST",
        body: JSON.stringify(vars),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "waitlist"] }),
  });

  async function decide(action: "approve" | "reject", entryId: string) {
    const reason = action === "reject"
      ? window.prompt("Alasan penolakan (opsional)?") ?? ""
      : "";
    try {
      await act.mutateAsync({ action, entryId, reason });
    } catch {
      window.alert("Gagal memproses. Coba lagi.");
    }
  }

  const entries = data?.entries ?? [];

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-spacing-4 px-spacing-4 pb-24 pt-spacing-6">
      <h1 className="text-2xl font-semibold">Antrean pendaftar</h1>
      {entries.length === 0 ? (
        <p className="text-surface-warm-white/60">Belum ada pendaftar menunggu.</p>
      ) : (
        <ul className="flex flex-col gap-spacing-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-radius-lg border border-surface-warm-white/10 bg-surface-warm-white/5 p-spacing-4">
              <div className="flex items-start justify-between gap-spacing-3">
                <div>
                  <p className="font-medium">{entry.businessName}</p>
                  {entry.businessType && <p className="text-sm text-surface-warm-white/60">{entry.businessType}</p>}
                  {entry.phone && <p className="text-sm text-surface-warm-white/60">{entry.phone}</p>}
                </div>
              </div>
              <p className="mt-spacing-2 text-sm text-surface-warm-white/80 line-clamp-4">{entry.story}</p>
              <div className="mt-spacing-3 flex gap-spacing-2">
                <button onClick={() => decide("approve", entry.id)} className="rounded-radius-md bg-emerald-600 px-spacing-3 py-spacing-2 text-sm text-white">Setujui</button>
                <button onClick={() => decide("reject", entry.id)} className="rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm">Tolak</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

Note: confirm `fetchJson`'s exact path + signature with `grep -rn "export function fetchJson\|export const fetchJson" src/` and match it (the workspace uses it elsewhere). Confirm `requireAdmin().status` shape from `src/lib/auth-admin.ts`.

- [ ] **Step 2: Add Storybook stories for the dashboard states**

Create `src/stories/AdminWaitlist.stories.tsx` with `Pending` (3 entries), `Empty`, and `DeclineWithReason` states, following the existing story patterns. Use mock data; no live API.

- [ ] **Step 3: Regenerate routes + typecheck**

Run: `bunx tsr generate && bunx tsc --noEmit`
Expected: `/admin` registered, no type errors.

- [ ] **Step 4: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_main.admin.tsx src/stories/AdminWaitlist.stories.tsx
git commit -m "feat(admin): /admin waitlist dashboard (approve/decline, mobile-first)"
```

---

### Task 5: Pre-fill the waitlist form on rejection

**Files:**
- Modify: `src/routes/_main.waitlist.tsx`

**Interfaces:**
- Consumes: `GET /api/user/waitlist` now returns `{ status, own? }` (Task 3), the existing `POST /api/waitlist` submit (unchanged).
- Produces: on mount, the form fetches own-entry; if present, pre-fills `businessName`/`phone`/`story` + shows the existing image thumbnail with a "Ganti gambar" affordance. A re-submit hits the same POST → the existing upsert updates + resets to pending.

- [ ] **Step 1: Add the own-entry fetch + pre-fill**

In `src/routes/_main.waitlist.tsx`, add a `useQuery` for `/api/user/waitlist` (returning `{ status, own? }`) and pre-fill the existing `useState` fields (`businessName`, `phone`, `story`) from `own` when present. Show the existing image thumbnail (resolved from `own.imageRef` via the existing object-storage read path used by admin — confirm the waitlist evidence serve path with `grep -n "imageRef\|object:" src/routes/api.waitlist.ts src/lib/waitlist.ts`).

```tsx
const ownQuery = useQuery({
  queryFn: () => fetchJson<{ status: string | null; own?: OwnEntry }>("/api/user/waitlist"),
  queryKey: ["user", "waitlist", "own"],
  staleTime: 0,
});

useEffect(() => {
  const own = ownQuery.data?.own;
  if (own) {
    setBusinessName(own.businessName);
    // set phone, story, businessType from own
  }
}, [ownQuery.data]);
```

Render the existing image thumbnail (if `own.imageRef`) above the file input with a "Ganti gambar" affordance that opens the existing file input.

- [ ] **Step 2: Typecheck + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors.

- [ ] **Step 3: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_main.waitlist.tsx
git commit -m "feat(waitlist): pre-fill form with last submission on rejection"
```

---

### Task 6: Manual E2E (toggle on/off + admin flow)

Not committed code — a verification checklist.

- [ ] **Step 1: Toggle off — gate is pass-through**

`.env`: `WAITLIST_ENABLED="false"`. `bun run dev`. Sign in as a non-admin with no entry → you are NOT redirected to `/waitlist`. ✅

- [ ] **Step 2: Toggle on — gate works**

`.env`: `WAITLIST_ENABLED="true"`. Sign in as a non-admin with no entry → redirected to `/waitlist`. Submit → entry pending → still gated. ✅

- [ ] **Step 3: Admin approve flow**

Sign in as `ADMIN_EMAILS` user → visit `/admin` → see the pending entry → "Setujui" → the entry leaves the list. The applicant (re-sign-in) now passes the gate. ✅

- [ ] **Step 4: Admin decline → refill → re-pending**

Sign in as admin → "Tolak" on an entry (with reason) → status `rejected`. Sign in as the applicant → land on `/waitlist` with the form pre-filled → edit → submit → status back to `pending` (re-appears in admin list). ✅

- [ ] **Step 5: Non-admin hits /admin → 403**

Sign in as a non-admin → visit `/admin` → 403. ✅

- [ ] **Step 6: Unset toggle → fail-safe on**

`.env`: delete `WAITLIST_ENABLED`. Sign in as non-admin with no entry → gated to `/waitlist` (default true). ✅

- [ ] **Step 7: No regression**

Run: `bun run check`
Expected: all green.

---

## Post-implementation

- Update `docs/architecture.md` if the auth/gate row changes (the `NODE_ENV` branch is gone, replaced by `WAITLIST_ENABLED`). One line.
- The admin page is the first `_main` surface built mobile-first; it sets the bar for topic 4 (mobile everywhere).
