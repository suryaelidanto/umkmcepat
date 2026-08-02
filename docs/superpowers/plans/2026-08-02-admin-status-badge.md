# Admin Status Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shared restrained status pills on `/admin/*` so lifecycle states (especially antrean Menunggu / Disetujui / Ditolak) are scannable without off-token colors.

**Architecture:** Pure presentational `AdminStatusBadge` (tone + children) plus pure helpers in `admin-status.ts` for domain → `{ tone, label }`. Consumers swap ad-hoc spans for the badge. No new DESIGN tokens; only `destructive` + `surface-warm-white` opacity tiers.

**Tech Stack:** React, Tailwind v4 theme tokens (`surface-warm-white`, `destructive`, `spacing-*`, `radius-*`), Vitest for pure helpers, Bun.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-02-admin-status-badge-design.md` — follow tone table and touch list exactly.
- No aurora / emerald / amber / github / `text-red-*` for lifecycle status.
- User-facing admin labels Indonesian where tables specify; project/build raw DB strings stay as-is.
- Surgical edits: status markup only; do not restyle filters, category chips, or layout.
- Developer docs/code English; no secrets in tracked files.
- Pre-commit: `bun run check:commit`. Handoff: `bun run check`.
- Atomic commits per task.

## File map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/components/admin/admin-status.ts` | Pure tone/label helpers |
| Create | `src/components/admin/admin-status.test.ts` | Unit tests for helpers |
| Create | `src/components/admin/AdminStatusBadge.tsx` | Presentational pill |
| Modify | `src/routes/_main.admin.waitlist.tsx` | Waitlist badge |
| Modify | `src/routes/_main.admin.transactions.tsx` | Payment badge |
| Modify | `src/components/admin/AdminOverviewDashboard.tsx` | Overview status cells |
| Modify | `src/routes/_main.admin.projects.tsx` | Project/build badges |
| Modify | `src/routes/_main.admin.tickets.tsx` | List open/resolved badge |
| Modify | `src/routes/_main.admin.tickets.$ticketId.tsx` | Detail status badge |
| Modify | `src/routes/_main.admin.users.tsx` | Verified/banned badges |

---

### Task 1: Pure helpers + tests

**Files:**
- Create: `src/components/admin/admin-status.ts`
- Create: `src/components/admin/admin-status.test.ts`

**Interfaces:**
- Produces:
  - `export type AdminStatusTone = "success" | "pending" | "danger" | "neutral"`
  - `export type AdminStatusDisplay = { tone: AdminStatusTone; label: string }`
  - `waitlistStatusDisplay(status: string): AdminStatusDisplay`
  - `paymentStatusDisplay(status: string): AdminStatusDisplay`
  - `projectStatusTone(value: string): AdminStatusTone`
  - `ticketStatusDisplay(status: string): AdminStatusDisplay`
  - `userFlagsDisplay(input: { verified: boolean; banned: boolean }): AdminStatusDisplay[]`

- [ ] **Step 1: Write failing tests**

```ts
// src/components/admin/admin-status.test.ts
import { describe, expect, it } from "vitest";

import {
  paymentStatusDisplay,
  projectStatusTone,
  ticketStatusDisplay,
  userFlagsDisplay,
  waitlistStatusDisplay,
} from "./admin-status";

describe("waitlistStatusDisplay", () => {
  it("maps pending and waitlisted to Menunggu/pending", () => {
    expect(waitlistStatusDisplay("pending")).toEqual({
      tone: "pending",
      label: "Menunggu",
    });
    expect(waitlistStatusDisplay("waitlisted")).toEqual({
      tone: "pending",
      label: "Menunggu",
    });
  });

  it("maps approved and rejected", () => {
    expect(waitlistStatusDisplay("approved")).toEqual({
      tone: "success",
      label: "Disetujui",
    });
    expect(waitlistStatusDisplay("rejected")).toEqual({
      tone: "danger",
      label: "Ditolak",
    });
  });

  it("falls back to raw neutral", () => {
    expect(waitlistStatusDisplay("weird")).toEqual({
      tone: "neutral",
      label: "weird",
    });
  });
});

describe("paymentStatusDisplay", () => {
  it("maps COMPLETED PENDING FAILED", () => {
    expect(paymentStatusDisplay("COMPLETED")).toEqual({
      tone: "success",
      label: "Selesai",
    });
    expect(paymentStatusDisplay("PENDING")).toEqual({
      tone: "pending",
      label: "Menunggu",
    });
    expect(paymentStatusDisplay("FAILED")).toEqual({
      tone: "danger",
      label: "Gagal",
    });
  });
});

describe("projectStatusTone", () => {
  it("classifies fail/progress/success/neutral", () => {
    expect(projectStatusTone("failed")).toBe("danger");
    expect(projectStatusTone("build_error")).toBe("danger");
    expect(projectStatusTone("canceled")).toBe("danger");
    expect(projectStatusTone("stale")).toBe("danger");
    expect(projectStatusTone("succeeded")).toBe("success");
    expect(projectStatusTone("ready")).toBe("success");
    expect(projectStatusTone("running")).toBe("pending");
    expect(projectStatusTone("queued")).toBe("pending");
    expect(projectStatusTone("draft")).toBe("neutral");
  });
});

describe("ticketStatusDisplay", () => {
  it("maps OPEN and RESOLVED", () => {
    expect(ticketStatusDisplay("OPEN")).toEqual({
      tone: "pending",
      label: "Buka",
    });
    expect(ticketStatusDisplay("RESOLVED")).toEqual({
      tone: "neutral",
      label: "Selesai",
    });
  });
});

describe("userFlagsDisplay", () => {
  it("returns verified and optional banned badges", () => {
    expect(userFlagsDisplay({ verified: true, banned: false })).toEqual([
      { tone: "success", label: "Terverifikasi" },
    ]);
    expect(userFlagsDisplay({ verified: false, banned: true })).toEqual([
      { tone: "neutral", label: "Belum verifikasi" },
      { tone: "danger", label: "Diblokir" },
    ]);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun test src/components/admin/admin-status.test.ts
```

Expected: FAIL (module not found / exports missing).

- [ ] **Step 3: Implement helpers**

```ts
// src/components/admin/admin-status.ts
export type AdminStatusTone = "success" | "pending" | "danger" | "neutral";

export type AdminStatusDisplay = {
  tone: AdminStatusTone;
  label: string;
};

export function waitlistStatusDisplay(status: string): AdminStatusDisplay {
  switch (status) {
    case "pending":
    case "waitlisted":
      return { tone: "pending", label: "Menunggu" };
    case "approved":
      return { tone: "success", label: "Disetujui" };
    case "rejected":
      return { tone: "danger", label: "Ditolak" };
    default:
      return { tone: "neutral", label: status };
  }
}

export function paymentStatusDisplay(status: string): AdminStatusDisplay {
  switch (status) {
    case "COMPLETED":
      return { tone: "success", label: "Selesai" };
    case "PENDING":
      return { tone: "pending", label: "Menunggu" };
    case "FAILED":
      return { tone: "danger", label: "Gagal" };
    default:
      return { tone: "neutral", label: status };
  }
}

export function projectStatusTone(value: string): AdminStatusTone {
  const v = value.toLowerCase();
  if (
    v.includes("fail") ||
    v.includes("error") ||
    v === "canceled" ||
    v === "cancelled" ||
    v === "stale"
  ) {
    return "danger";
  }
  if (v === "ready" || v === "passed" || v === "succeeded") {
    return "success";
  }
  if (
    v === "running" ||
    v === "building" ||
    v === "generating" ||
    v === "editing" ||
    v === "repairing" ||
    v === "queued" ||
    v === "starting"
  ) {
    return "pending";
  }
  return "neutral";
}

export function ticketStatusDisplay(status: string): AdminStatusDisplay {
  switch (status) {
    case "OPEN":
      return { tone: "pending", label: "Buka" };
    case "RESOLVED":
      return { tone: "neutral", label: "Selesai" };
    default:
      return { tone: "neutral", label: status };
  }
}

export function userFlagsDisplay(input: {
  verified: boolean;
  banned: boolean;
}): AdminStatusDisplay[] {
  const flags: AdminStatusDisplay[] = [
    input.verified
      ? { tone: "success", label: "Terverifikasi" }
      : { tone: "neutral", label: "Belum verifikasi" },
  ];
  if (input.banned) {
    flags.push({ tone: "danger", label: "Diblokir" });
  }
  return flags;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun test src/components/admin/admin-status.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/admin-status.ts src/components/admin/admin-status.test.ts
git commit -m "$(cat <<'EOF'
feat(admin): add status tone/label helpers

EOF
)"
```

---

### Task 2: AdminStatusBadge component

**Files:**
- Create: `src/components/admin/AdminStatusBadge.tsx`

**Interfaces:**
- Consumes: `AdminStatusTone` from `./admin-status`
- Produces: `AdminStatusBadge({ tone, children })`

- [ ] **Step 1: Implement component**

```tsx
// src/components/admin/AdminStatusBadge.tsx
import type { ReactNode } from "react";

import type { AdminStatusTone } from "./admin-status";

const TONE_CLASS: Record<AdminStatusTone, string> = {
  success:
    "border-surface-warm-white/50 bg-surface-warm-white/15 text-surface-warm-white",
  pending:
    "border-surface-warm-white/30 bg-surface-warm-white/8 text-surface-warm-white/90",
  danger: "border-destructive/50 bg-destructive/15 text-destructive",
  neutral:
    "border-surface-warm-white/12 bg-transparent text-surface-warm-white/70",
};

export function AdminStatusBadge({
  tone,
  children,
}: {
  tone: AdminStatusTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-spacing-2 py-0.5 text-[11px] font-medium leading-none ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck smoke**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | head -40
```

Expected: no errors from `AdminStatusBadge.tsx` (full project may have pre-existing noise; ignore unrelated).

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/AdminStatusBadge.tsx
git commit -m "$(cat <<'EOF'
feat(admin): add AdminStatusBadge pill

EOF
)"
```

---

### Task 3: Waitlist (antrean)

**Files:**
- Modify: `src/routes/_main.admin.waitlist.tsx`

**Interfaces:**
- Consumes: `AdminStatusBadge`, `waitlistStatusDisplay`

- [ ] **Step 1: Wire imports and drop local label-only usage for the pill**

Add imports:

```tsx
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { waitlistStatusDisplay } from "@/components/admin/admin-status";
```

Keep local `statusLabel` only if still used elsewhere; if only used by the pill, delete `statusLabel` and use `waitlistStatusDisplay` exclusively. Keep `isPending` as-is.

- [ ] **Step 2: Replace monochrome span**

Find (approx lines 174–176):

```tsx
<span className="shrink-0 rounded-full border border-surface-warm-white/15 px-spacing-2 py-0.5 text-[11px] text-surface-warm-white/80">
  {statusLabel(entry.status)}
</span>
```

Replace with:

```tsx
{(() => {
  const display = waitlistStatusDisplay(entry.status);
  return (
    <AdminStatusBadge tone={display.tone}>{display.label}</AdminStatusBadge>
  );
})()}
```

Prefer cleaner form without IIFE — compute once in map callback:

```tsx
{entries.map((entry) => {
  const status = waitlistStatusDisplay(entry.status);
  return (
    <div key={entry.id} /* existing classes */>
      {/* ... */}
      <AdminStatusBadge tone={status.tone}>{status.label}</AdminStatusBadge>
      {/* ... */}
    </div>
  );
})}
```

If `statusLabel` becomes unused, remove the function.

- [ ] **Step 3: Lint file**

```bash
bunx eslint src/routes/_main.admin.waitlist.tsx
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_main.admin.waitlist.tsx
git commit -m "$(cat <<'EOF'
feat(admin): color waitlist status badges

EOF
)"
```

---

### Task 4: Transactions + overview

**Files:**
- Modify: `src/routes/_main.admin.transactions.tsx`
- Modify: `src/components/admin/AdminOverviewDashboard.tsx`

**Interfaces:**
- Consumes: `AdminStatusBadge`, `paymentStatusDisplay`

- [ ] **Step 1: Transactions list status**

Import badge + helper. Replace (approx lines 105–115):

```tsx
<span
  className={
    t.status === "COMPLETED"
      ? "text-emerald-400"
      : t.status === "PENDING"
        ? "text-amber-400"
        : "text-red-400"
  }
>
  {t.status}
</span>
```

With:

```tsx
{(() => {
  const display = paymentStatusDisplay(t.status);
  return (
    <AdminStatusBadge tone={display.tone}>{display.label}</AdminStatusBadge>
  );
})()}
```

Or bind `const display = paymentStatusDisplay(t.status)` in the map body.

Filter option labels may stay English (`Pending`/`Completed`/`Failed`) — out of scope per design (filter chips unchanged). Only the row status changes to Indonesian labels from the helper.

- [ ] **Step 2: Overview invoices table**

In `AdminOverviewDashboard.tsx`, import badge + helper. Replace status cell:

```tsx
<td className="px-4 py-2.5">{t.status}</td>
```

With:

```tsx
<td className="px-4 py-2.5">
  {(() => {
    const display = paymentStatusDisplay(t.status);
    return (
      <AdminStatusBadge tone={display.tone}>{display.label}</AdminStatusBadge>
    );
  })()}
</td>
```

- [ ] **Step 3: Overview activity feed (tx status suffix)**

Where feed appends ` · ${item.status}` for transactions, replace the raw string with a trailing badge when status is present:

```tsx
{"status" in item && item.status ? (
  <>
    {" "}
    <AdminStatusBadge tone={paymentStatusDisplay(item.status).tone}>
      {paymentStatusDisplay(item.status).label}
    </AdminStatusBadge>
  </>
) : null}
```

Prefer computing once:

```tsx
const payment =
  "status" in item && item.status
    ? paymentStatusDisplay(item.status)
    : null;
// ...
{payment ? (
  <>
    {" "}
    <AdminStatusBadge tone={payment.tone}>{payment.label}</AdminStatusBadge>
  </>
) : null}
```

Remove the old ` · ${item.status}` text concatenation.

- [ ] **Step 4: Lint**

```bash
bunx eslint src/routes/_main.admin.transactions.tsx src/components/admin/AdminOverviewDashboard.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/_main.admin.transactions.tsx src/components/admin/AdminOverviewDashboard.tsx
git commit -m "$(cat <<'EOF'
feat(admin): payment status badges on tx + overview

EOF
)"
```

---

### Task 5: Projects

**Files:**
- Modify: `src/routes/_main.admin.projects.tsx`

**Interfaces:**
- Consumes: `AdminStatusBadge`, `projectStatusTone`

- [ ] **Step 1: Remove local `statusPillClass`**

Delete the entire `statusPillClass` function (approx lines 48–75).

- [ ] **Step 2: Import and use badge**

```tsx
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { projectStatusTone } from "@/components/admin/admin-status";
```

Replace the two status spans (approx 156–165):

```tsx
<span
  className={`rounded-radius-sm border px-spacing-2 py-spacing-1 ${statusPillClass(project.status)}`}
>
  {project.status}
</span>
<span
  className={`rounded-radius-sm border px-spacing-2 py-spacing-1 ${statusPillClass(project.buildStatus)}`}
>
  Build: {project.buildStatus}
</span>
```

With:

```tsx
<AdminStatusBadge tone={projectStatusTone(project.status)}>
  {project.status}
</AdminStatusBadge>
<AdminStatusBadge tone={projectStatusTone(project.buildStatus)}>
  Build: {project.buildStatus}
</AdminStatusBadge>
```

Labels stay raw DB strings per design.

- [ ] **Step 3: Lint + commit**

```bash
bunx eslint src/routes/_main.admin.projects.tsx
git add src/routes/_main.admin.projects.tsx
git commit -m "$(cat <<'EOF'
feat(admin): project status badges via shared tone map

EOF
)"
```

---

### Task 6: Tickets list + detail

**Files:**
- Modify: `src/routes/_main.admin.tickets.tsx`
- Modify: `src/routes/_main.admin.tickets.$ticketId.tsx`

**Interfaces:**
- Consumes: `AdminStatusBadge`, `ticketStatusDisplay`

- [ ] **Step 1: Tickets list — add status badge**

Import badge + helper. Inside the ticket card header row (near category chip, approx after `#shortId` / category span), add:

```tsx
{(() => {
  const display = ticketStatusDisplay(ticket.status);
  return (
    <AdminStatusBadge tone={display.tone}>{display.label}</AdminStatusBadge>
  );
})()}
```

Place next to the category chip so both labels read together. Do **not** change `CATEGORY_COLORS` / `CATEGORY_LABELS`.

- [ ] **Step 2: Ticket detail — replace aurora status**

Find (approx 263–271):

```tsx
<span
  className={`rounded-radius-sm px-2 py-0.5 text-[10px] font-bold ${
    ticket.status === "OPEN"
      ? "bg-aurora-orange/15 text-aurora-orange"
      : "bg-surface-warm-white/10 text-surface-warm-white/50"
  }`}
>
  {ticket.status === "OPEN" ? "BUKA" : "SELESAI"}
</span>
```

Replace with:

```tsx
{(() => {
  const display = ticketStatusDisplay(ticket.status);
  return (
    <AdminStatusBadge tone={display.tone}>{display.label}</AdminStatusBadge>
  );
})()}
```

Keep resolve button logic (`isOpen`) unchanged.

- [ ] **Step 3: Lint + commit**

```bash
bunx eslint src/routes/_main.admin.tickets.tsx src/routes/_main.admin.tickets.\$ticketId.tsx
git add src/routes/_main.admin.tickets.tsx src/routes/_main.admin.tickets.\$ticketId.tsx
git commit -m "$(cat <<'EOF'
feat(admin): ticket open/resolved status badges

EOF
)"
```

---

### Task 7: Users flags

**Files:**
- Modify: `src/routes/_main.admin.users.tsx`

**Interfaces:**
- Consumes: `AdminStatusBadge`, `userFlagsDisplay`

- [ ] **Step 1: Replace inline verified/banned text**

Import badge + helper. Replace (approx 115–119):

```tsx
<p className="text-surface-warm-white/70">
  {u.projectsCount} proyek ·{" "}
  {u.verified ? "Terverifikasi" : "Belum verifikasi"}
  {u.bannedAt ? " · Diblokir" : ""}
</p>
```

With:

```tsx
<div className="mt-spacing-1 flex flex-wrap items-center gap-spacing-2 text-surface-warm-white/70">
  <span>{u.projectsCount} proyek</span>
  {userFlagsDisplay({
    verified: u.verified,
    banned: Boolean(u.bannedAt),
  }).map((flag) => (
    <AdminStatusBadge key={flag.label} tone={flag.tone}>
      {flag.label}
    </AdminStatusBadge>
  ))}
</div>
```

- [ ] **Step 2: Lint + commit**

```bash
bunx eslint src/routes/_main.admin.users.tsx
git add src/routes/_main.admin.users.tsx
git commit -m "$(cat <<'EOF'
feat(admin): user verified/banned status badges

EOF
)"
```

---

### Task 8: Verify + handoff

**Files:** none new

- [ ] **Step 1: Run unit tests**

```bash
bun test src/components/admin/admin-status.test.ts
```

Expected: PASS.

- [ ] **Step 2: Full local gate**

```bash
bun run check
```

Expected: format/lint/typecheck/affected tests/Knip all green.

- [ ] **Step 3: Manual visual checklist**

Open while logged in as admin:

1. `/admin/waitlist` — Menunggu / Disetujui / Ditolak distinct pills
2. `/admin/transactions` — Selesai / Menunggu / Gagal badges (no emerald/amber)
3. `/admin` — overview tx table + activity feed badges
4. `/admin/projects` — status + build pills with tone tiers
5. `/admin/tickets` + one ticket detail — Buka / Selesai, no aurora status
6. `/admin/users` — Terverifikasi / Belum / Diblokir badges

- [ ] **Step 4: Final commit only if Step 2 left uncommitted format fixes**

```bash
git status
# if prettier/eslint auto-fixed files:
git add -u
git commit -m "$(cat <<'EOF'
chore(admin): format after status badge wire-up

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| `admin-status.ts` helpers + tone tables | Task 1 |
| `AdminStatusBadge` presentational | Task 2 |
| Waitlist antrean colors | Task 3 |
| Transactions + overview | Task 4 |
| Projects tone (no ad-hoc pill) | Task 5 |
| Tickets list + detail | Task 6 |
| Users flags | Task 7 |
| No aurora/emerald; DESIGN tokens only | Tasks 2–6 classes |
| Unit tests + `bun run check` | Tasks 1, 8 |
| Skip filter chips / category colors / DESIGN.md tokens | Out of scope (no tasks) |

## Self-review notes

- No TBD placeholders.
- Helper names consistent across tasks (`waitlistStatusDisplay`, `paymentStatusDisplay`, `projectStatusTone`, `ticketStatusDisplay`, `userFlagsDisplay`).
- `AdminStatusTone` defined once in `admin-status.ts`, re-exported usage from badge.
- Storybook optional per design — not in tasks (YAGNI).
