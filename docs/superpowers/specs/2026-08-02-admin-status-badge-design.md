# Admin Status Badge Design

## Problem

`/admin/*` status labels are inconsistent and hard to scan:

- **Waitlist (antrean):** Menunggu / Disetujui / Ditolak share one monochrome pill — no semantic color.
- **Transactions:** ad-hoc `text-emerald-400` / `text-amber-400` / `text-red-400` (off DESIGN tokens), raw English `PENDING`/`COMPLETED`/`FAILED`.
- **Projects:** local `statusPillClass` — fail uses `destructive`; success and in-progress share the same warm-white tier.
- **Tickets:** OPEN uses `aurora-orange` (DESIGN forbids aurora as status color); list has no open/resolved badge.
- **Users:** verified / banned are plain inline text.
- **Overview:** transaction status column is unstyled plain text.

No shared status badge component. Four ad-hoc approaches.

## Goals

1. One restrained status pill vocabulary across admin lifecycle statuses.
2. Instant visual scan for antrean (Menunggu / Disetujui / Ditolak).
3. Stay on DESIGN tokens: `destructive` + `surface-warm-white` opacity tiers only.
4. Indonesian labels where admin UI already uses Indonesian; technical project/build strings may stay raw.

## Non-goals

- New DESIGN.md color tokens (`status-success`, etc.).
- Changing `AdminStatusFilter` chip styling (filter selection ≠ row status).
- Ticket **category** badge colors (categorical, already labeled).
- Public/user-facing waitlist or support pages (admin only unless same component is trivially reusable later).
- Layout / table structure changes beyond swapping status markup for the badge.

## Design constraints (from DESIGN.md)

- **Destructive** (`#9f1d1d`): real errors / destructive outcomes only.
- **Aurora / GitHub proof colors:** not for status badges.
- No emerald / amber / red Tailwind palette for product status.
- Admin chrome is dark (`#151515`); pills use translucent warm-white shells.

## Tone map

Four tones only:

| Tone | Meaning | Tailwind classes (dark admin) |
|---|---|---|
| `success` | Approved, completed, verified, ready/succeeded | `border-surface-warm-white/50 bg-surface-warm-white/15 text-surface-warm-white` |
| `pending` | Waiting, open, in-progress, queued/running | `border-surface-warm-white/30 bg-surface-warm-white/8 text-surface-warm-white/90` |
| `danger` | Rejected, failed, banned, canceled/stale | `border-destructive/50 bg-destructive/15 text-destructive` |
| `neutral` | Resolved/done idle, unverified, unknown | `border-surface-warm-white/12 bg-transparent text-surface-warm-white/70` |

Shape (shared):

```
rounded-full border px-spacing-2 py-0.5 text-[11px] font-medium leading-none
```

Accessibility: color + text label always; never color alone.

## Component

**File:** `src/components/admin/AdminStatusBadge.tsx`

```tsx
export type AdminStatusTone = "success" | "pending" | "danger" | "neutral";

export function AdminStatusBadge({
  tone,
  children,
}: {
  tone: AdminStatusTone;
  children: React.ReactNode;
}): React.JSX.Element;
```

Pure presentational. No domain knowledge inside the component.

Domain tone + label maps live next to each consumer (or as pure helpers exported from the same module if reused by 2+ routes). Prefer **one helper module** colocated:

**File:** `src/components/admin/admin-status.ts`

Pure functions (no React) for tone/label resolution used by multiple admin surfaces:

| Helper | Domain |
|---|---|
| `waitlistStatusDisplay(status: string): { tone; label }` | waitlist |
| `paymentStatusDisplay(status: string): { tone; label }` | transactions + overview |
| `projectStatusTone(value: string): AdminStatusTone` | project + build status (label stays raw) |
| `ticketStatusDisplay(status: "OPEN" \| "RESOLVED"): { tone; label }` | tickets |
| `userFlagsDisplay(input: { verified: boolean; banned: boolean }): Array<{ tone; label }>` | users (0–2 badges) |

Unknown / unexpected strings → `neutral` + original string (or a safe Indonesian fallback only where a map already exists).

### Label + tone tables

**Waitlist**

| Raw | Label | Tone |
|---|---|---|
| `pending`, `waitlisted` | Menunggu | pending |
| `approved` | Disetujui | success |
| `rejected` | Ditolak | danger |
| other | raw | neutral |

**Payment / transactions**

| Raw | Label | Tone |
|---|---|---|
| `COMPLETED` | Selesai | success |
| `PENDING` | Menunggu | pending |
| `FAILED` | Gagal | danger |
| other | raw | neutral |

**Project / build** (label = raw DB string; tone only)

| Match (case-insensitive) | Tone |
|---|---|
| includes `fail` / `error`, or `canceled` / `cancelled` / `stale` | danger |
| `ready` / `passed` / `succeeded` | success |
| `running` / `building` / `generating` / `editing` / `repairing` / `queued` / `starting` | pending |
| else | neutral |

**Tickets**

| Raw | Label | Tone |
|---|---|---|
| `OPEN` | Buka | pending |
| `RESOLVED` | Selesai | neutral |

**Users**

| Condition | Label | Tone |
|---|---|---|
| `verified` | Terverifikasi | success |
| `!verified` | Belum verifikasi | neutral |
| `bannedAt` set | Diblokir | danger |

Show verified badge always; show Diblokir when banned (in addition).

## Touch points

| Surface | File | Change |
|---|---|---|
| Waitlist rows | `src/routes/_main.admin.waitlist.tsx` | Replace monochrome span with `AdminStatusBadge` + `waitlistStatusDisplay` |
| Transactions list | `src/routes/_main.admin.transactions.tsx` | Replace colored text with badge + `paymentStatusDisplay` |
| Overview invoices table | `src/components/admin/AdminOverviewDashboard.tsx` | Status cell → badge |
| Overview activity feed | same | Optional: badge for tx status when present (keep compact) |
| Projects list | `src/routes/_main.admin.projects.tsx` | Delete local `statusPillClass`; use badge + `projectStatusTone` |
| Tickets list | `src/routes/_main.admin.tickets.tsx` | Add open/resolved badge next to category chip |
| Ticket detail | `src/routes/_main.admin.tickets.$ticketId.tsx` | Replace aurora OPEN/SELESAI span with badge |
| Users list | `src/routes/_main.admin.users.tsx` | Replace inline verified/banned text with badge(s) |

## Out of scope files

- `AdminStatusFilter.tsx` — filter chips unchanged.
- Ticket category color maps — unchanged.
- Non-admin routes (`_main.waitlist.tsx`, `_main.support.tsx`, etc.).

## Testing

- Unit tests for pure helpers in `admin-status.ts` (tone + label tables).
- No Playwright/visual required for this change; manual glance at `/admin/waitlist`, `/admin/transactions`, `/admin/projects`, `/admin/tickets`, `/admin/users`, `/admin`.
- `bun run check` before handoff.

## Storybook

Optional: one story for `AdminStatusBadge` showing four tones. Skip if no existing admin Storybook pattern; not required for ship.

## Docs

- This design doc is the source of truth.
- No DESIGN.md token additions.
- No PRODUCT.md changes.
- Implementation plan: `docs/superpowers/plans/2026-08-02-admin-status-badge.md`.

## Success criteria

1. Antrean statuses are distinct at a glance (pending vs success vs danger).
2. No emerald/amber/aurora/github colors used for lifecycle status on admin.
3. All listed admin surfaces use `AdminStatusBadge` for lifecycle status.
4. Labels remain readable with color + text; contrast OK on dark chrome.
5. `bun run check` passes.
