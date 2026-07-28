# Admin UI Contrast Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix washed-out/low-contrast text and borders across `/admin/*` routes so live content stops reading as disabled.

**Architecture:** Pure opacity-token correction — no new colors, components, or layout. Dark chrome (`bg-[#151515]` on `body`) stays; translucent `bg-surface-warm-white/N` card fills stay; only text and border opacity values change to match the rest of the product (opaque `text-surface-warm-white` for primary, `/70` floor for secondary, `/12` borders).

**Tech Stack:** TanStack Router routes, Tailwind v4 with `@theme inline` tokens (`surface-warm-white` = `#fcfbf8`), `border-surface-warm-white/N` and `text-surface-warm-white/N` opacity utilities.

## Global Constraints

- User-facing product UI copy is Indonesian; developer docs/code/logs/errors English. No copy changes in this plan — strings stay verbatim.
- Surgical edits only: touch the opacity utilities in the listed files. Do not refactor, restructure, rename, reorder, or "clean up" adjacent markup.
- No new files, no new components, no new colors, no DESIGN.md changes.
- Pre-commit runs `bun run check:commit` (Prettier + ESLint on staged files). Do not add trailing commas or reformat beyond the targeted edits.
- Atomic commits: one logical unit per commit. Commit per file (or per closely-related group) as it finishes.
- `bun run check` must pass before handoff — run it once at the end (it runs format/lint/typecheck/`test:changed`/Knip in parallel).

## Fix table (apply verbatim in every file)

| Element | Current | Fixed |
|---|---|---|
| Primary text (values, primary line, tab labels, table cells, status pills text) | `text-surface-warm-white/40` ` /50` ` /60` ` /80` | `text-surface-warm-white` (opaque) |
| Secondary/metadata text (timestamps, emails, sub-labels, helper/empty-state lines) | `text-surface-warm-white/40` ` /50` ` /60` | `text-surface-warm-white/70` |
| Card/row border | `border-surface-warm-white/10` | `border-surface-warm-white/12` |
| Card/row fill | `bg-surface-warm-white/5` | unchanged |
| Inactive tab text | `text-surface-warm-white/60` | `text-surface-warm-white/70` |
| Active tab fill | `bg-surface-warm-white/15` | unchanged (still the selected signal) |
| Active tab text | (inherits default, currently reads faint next to `/15` fill) | `text-surface-warm-white` (opaque) |
| Filter/segmented buttons (the `rounded-radius-md ... px-spacing-3 py-spacing-2 text-sm` buttons in users/transactions/settings) | faded text + `border-surface-warm-white/15` | opaque text; keep `/15` border on these (they're controls, not cards) |
| Disabled buttons | `disabled:opacity-40` | keep — disabled state legitimately uses reduced opacity |

**Classifying a given `text-surface-warm-white/N` as primary vs secondary — rule of thumb:** if the string is the main thing the row/tile communicates (stat value, business name, order ID, status word, tab label, the cell a user scans for), it is primary → opaque. If it is context around the primary (timestamp after a name, email under a name, "Belum ada …" helper, sub-label under a heading), it is secondary → `/70`. When unsure for a specific line, read the surrounding markup: the element carrying the row's identity is primary.

**No tests:** this is a visual contrast change with no logic, no new branches, no data flow. Trivial markup edits per CLAUDE.md/PRINCIPLES need no test harness. Verification is visual + `bun run check`.

---

## Task 1: AdminTabs — active/inactive tab contrast

**Files:**
- Modify: `src/components/admin/AdminTabs.tsx:13-42`

**Interfaces:** None — pure className edits, no prop/signature changes.

- [ ] **Step 1: Edit inactive tab text opacity**

In `src/components/admin/AdminTabs.tsx`, the inactive branch (line ~31) currently:

```tsx
: "rounded-radius-md px-spacing-3 py-spacing-2 text-sm text-surface-warm-white/60"
```

Change to:

```tsx
: "rounded-radius-md px-spacing-3 py-spacing-2 text-sm text-surface-warm-white/70"
```

- [ ] **Step 2: Make active tab text opaque**

The active branch (line ~30) currently:

```tsx
? "rounded-radius-md bg-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm font-medium"
```

Add explicit opaque text so the active label reads clearly against the `/15` fill:

```tsx
? "rounded-radius-md bg-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm font-medium text-surface-warm-white"
```

- [ ] **Step 3: Verify build/types**

Run: `bun run check`
Expected: PASS (no type errors — className strings only).

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/AdminTabs.tsx
git commit -m "fix(admin): readable active/inactive tab contrast

Inactive tab text /60 -> /70; active tab text opaque so the selected
tab reads clearly against the /15 fill instead of fading into it."
```

---

## Task 2: Overview page — stat tiles + list rows

**Files:**
- Modify: `src/routes/_main.admin.index.tsx:58-120`

**Interfaces:** None — route component, no exports consumed elsewhere.

- [ ] **Step 1: Fix stat tile text + border**

Tile markup (lines ~62-68) currently:

```tsx
<div
  className="rounded-radius-lg border border-surface-warm-white/10 bg-surface-warm-white/5 p-spacing-4"
  key={tile.label}
>
  <p className="text-sm text-surface-warm-white/60">{tile.label}</p>
  <p className="mt-spacing-1 text-xl font-semibold">{tile.value}</p>
</div>
```

Change border to `/12`; label is secondary metadata → `/70`; value is primary → already opaque (no `text-*` opacity class = inherits opaque), leave it:

```tsx
<div
  className="rounded-radius-lg border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-4"
  key={tile.label}
>
  <p className="text-sm text-surface-warm-white/70">{tile.label}</p>
  <p className="mt-spacing-1 text-xl font-semibold">{tile.value}</p>
</div>
```

- [ ] **Step 2: Fix "Pendaftar terbaru" empty-state helper**

Line ~91 currently:

```tsx
<p className="text-sm text-surface-warm-white/60">
  Belum ada pendaftar menunggu.
</p>
```

Change to `/70` (helper text floor):

```tsx
<p className="text-sm text-surface-warm-white/70">
  Belum ada pendaftar menunggu.
</p>
```

- [ ] **Step 3: Fix recent-waitlist row text + border**

Row markup (lines ~79-87) currently:

```tsx
<li
  className="rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-spacing-3 text-sm"
  key={e.id}
>
  <span className="font-medium">{e.businessName}</span>
  <span className="text-surface-warm-white/50">
    {" · "}
    {new Date(e.submittedAt).toLocaleDateString("id-ID")}
  </span>
</li>
```

`businessName` is primary (opaque, no change). The timestamp span is secondary → bump `/50` to `/70`; bump row border `/10` → `/12`:

```tsx
<li
  className="rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-3 text-sm"
  key={e.id}
>
  <span className="font-medium">{e.businessName}</span>
  <span className="text-surface-warm-white/70">
    {" · "}
    {new Date(e.submittedAt).toLocaleDateString("id-ID")}
  </span>
</li>
```

- [ ] **Step 4: Fix "Transaksi terbaru" empty-state helper**

Line ~115 currently:

```tsx
<p className="text-sm text-surface-warm-white/60">
  Belum ada transaksi.
</p>
```

Change to `/70`:

```tsx
<p className="text-sm text-surface-warm-white/70">
  Belum ada transaksi.
</p>
```

- [ ] **Step 5: Fix recent-transactions row text + border**

Row markup (lines ~104-110) currently:

```tsx
<li
  className="flex items-center justify-between rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-spacing-3 text-sm"
  key={t.orderId}
>
  <span className="font-mono">{t.orderId}</span>
  <span className="text-surface-warm-white/80">
    {formatRupiah(t.amount)} · {t.status}
  </span>
</li>
```

`orderId` is primary (opaque, no change). The amount+status span is the row's secondary context but still meaningful → make it opaque for readability (it carries the transaction's actual value/status the admin scans):

```tsx
<li
  className="flex items-center justify-between rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-3 text-sm"
  key={t.orderId}
>
  <span className="font-mono">{t.orderId}</span>
  <span className="text-surface-warm-white">
    {formatRupiah(t.amount)} · {t.status}
  </span>
</li>
```

- [ ] **Step 6: Verify**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/routes/_main.admin.index.tsx
git commit -m "fix(admin): overview page text/border contrast

Stat-tile labels /60 -> /70, list-row secondary text /50-/80 -> opaque
or /70, card borders /10 -> /12 so live content stops reading disabled."
```

---

## Task 3: Users page — rows + buttons

**Files:**
- Modify: `src/routes/_main.admin.users.tsx`

Read the file first to confirm line numbers (this plan was written against the committed state; verify before editing).

- [ ] **Step 1: Read the file**

Run: read `src/routes/_main.admin.users.tsx` in full. Identify every `text-surface-warm-white/N`, `border-surface-warm-white/N`, and the two `disabled:opacity-40` buttons.

- [ ] **Step 2: Fix empty-state helper**

The "Tidak ada pengguna." helper (around line 69) uses `text-surface-warm-white/60`. Change to `/70`:

```tsx
<p className="text-surface-warm-white/70">Tidak ada pengguna.</p>
```

- [ ] **Step 3: Fix user list rows**

User row (around lines 73-80) currently uses `border-surface-warm-white/10`, primary `font-medium` name (opaque — no change), and secondary `email` + sub-text at `/60` and `/40`. Apply: border `/10` → `/12`, email `/60` → `/70`, the `/40` sub-line (role/created-at metadata) → `/70`. The exact spans (confirm against the file):

```tsx
<li
  className="flex items-center justify-between rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-3 text-sm"
  key={u.id}
>
  <div>
    <p className="font-medium">{u.email}</p>
    <p className="text-surface-warm-white/70">{/* whatever metadata is here */}</p>
  </div>
  {/* action button(s) below */}
</li>
```

Replace the metadata `<p>` opacity class from `/40` (or `/60`) to `/70`. Keep `u.email` opaque (it's the row identity here — primary).

- [ ] **Step 4: Fix the page-size / pagination buttons (the `text-surface-warm-white/60` control span)**

Around line 110 there is a `px-spacing-2 py-spacing-2 text-sm text-surface-warm-white/60` span (a non-button label like a page indicator). Bump to `/70`:

```tsx
<span className="px-spacing-2 py-spacing-2 text-sm text-surface-warm-white/70">
```

- [ ] **Step 5: Leave disabled buttons as-is**

The two buttons with `disabled:opacity-40` (around lines 103, 114) are legitimately disabled-state controls — do NOT change `disabled:opacity-40`. Only ensure their enabled-text is opaque (no `text-surface-warm-white/N` on the button itself; if there is, remove the opacity so enabled text is opaque). Confirm by reading: if a button has `text-surface-warm-white/N`, drop the `/N` so it's opaque when enabled.

- [ ] **Step 6: Verify**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/routes/_main.admin.users.tsx
git commit -m "fix(admin): users page text/border contrast

Row metadata /40-/60 -> /70, borders /10 -> /12, keep disabled:opacity-40
on the pagination buttons."
```

---

## Task 4: Waitlist page — cards + detail rows

**Files:**
- Modify: `src/routes/_main.admin.waitlist.tsx`

- [ ] **Step 1: Read the file**

Read `src/routes/_main.admin.waitlist.tsx` in full; locate each `text-surface-warm-white/N` and `border-surface-warm-white/N`.

- [ ] **Step 2: Fix list-card text + border**

Card markup (around lines 89-107): border `/10` → `/12`. The business name is primary (opaque — no change if it has no opacity class). The description line at `/80` is primary content (the waitlist pitch) → make opaque. The metadata lines at `/60` (submitted-at, etc.) are secondary → `/70`. Concretely (confirm classes against file):

```tsx
<div
  className="rounded-radius-lg border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-4"
  key={e.id}
>
  {/* primary: business name — opaque, no change */}
  <p className="text-surface-warm-white/70">{/* submitted-at metadata */}</p>
  <p className="mt-spacing-2 line-clamp-4 text-sm text-surface-warm-white">
    {/* description — primary content */}
  </p>
</div>
```

So: change `text-surface-warm-white/80` (description) → opaque `text-surface-warm-white`; change each `text-surface-warm-white/60` (metadata/helper) → `/70`.

- [ ] **Step 3: Fix the expandable detail panel border**

Around line 113: `rounded-radius-md border border-surface-warm-white/10` (the `max-h-48` scrollable detail box). Bump to `/12`:

```tsx
className="mt-spacing-2 max-h-48 rounded-radius-md border border-surface-warm-white/12"
```

- [ ] **Step 4: Fix the action button(s)**

Around line 128: a `rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm` button (approve/reject control). This is a control, not a card → keep `/15` border; make its text opaque (drop any `text-surface-warm-white/N` so enabled text is opaque):

```tsx
className="rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm text-surface-warm-white"
```

- [ ] **Step 5: Verify**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/_main.admin.waitlist.tsx
git commit -m "fix(admin): waitlist page text/border contrast

Card borders /10 -> /12, description /80 -> opaque, metadata /60 -> /70,
action button text opaque."
```

---

## Task 5: Transactions page — filters + rows + detail

**Files:**
- Modify: `src/routes/_main.admin.transactions.tsx`

- [ ] **Step 1: Read the file**

Read `src/routes/_main.admin.transactions.tsx` in full.

- [ ] **Step 2: Fix the filter/segmented control buttons**

Around lines 70-71: active `bg-surface-warm-white/15` vs inactive `border border-surface-warm-white/15`. These are controls — keep `/15`. Make both branches' text opaque (add `text-surface-warm-white` if not present; if a branch currently has no text opacity class it inherits opaque — fine). Concretely, ensure:

```tsx
// active
? "rounded-radius-md bg-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm text-surface-warm-white"
// inactive
: "rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm text-surface-warm-white/70"
```

(Inactive control text at `/70` is acceptable — it signals "not selected" without reading disabled.)

- [ ] **Step 3: Fix the filter row wrapper border**

Around line 82: `rounded-radius-md border border-surface-warm-white/15 bg-surface-warm-white/5 px-spacing-3 py-spacing-2 text-sm`. Controls container — keep `/15` border; no text change needed here (text comes from the buttons inside).

- [ ] **Step 4: Fix empty-state helper**

Around line 88: `text-surface-warm-white/60` → `/70`:

```tsx
<p className="text-surface-warm-white/70">Tidak ada transaksi.</p>
```

- [ ] **Step 5: Fix transaction rows**

Row markup (around line 92): `border-surface-warm-white/10` → `/12`. Primary content (orderId, amount) opaque — confirm no `/N` on those spans; if present, remove it. The `paymentNumber` at `/40` (around line 114) is secondary metadata → `/70`. Example target for the row:

```tsx
<li
  className="rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-3 text-sm"
  key={t.orderId}
>
  {/* primary: orderId, amount, status — opaque */}
  <p className="text-surface-warm-white/70">{t.paymentNumber}</p>
</li>
```

- [ ] **Step 6: Fix the detail/expand button**

Around line 118: `rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm`. Control — keep `/15`, make text opaque:

```tsx
className="mt-spacing-2 rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm text-surface-warm-white"
```

- [ ] **Step 7: Verify**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/routes/_main.admin.transactions.tsx
git commit -m "fix(admin): transactions page text/border contrast

Filter control text opaque/inactive /70, row borders /10 -> /12,
paymentNumber /40 -> /70, detail button text opaque."
```

---

## Task 6: Settings page — rows + inputs

**Files:**
- Modify: `src/routes/_main.admin.settings.tsx`

- [ ] **Step 1: Read the file**

Read `src/routes/_main.admin.settings.tsx` in full.

- [ ] **Step 2: Fix the config row**

Around line 63: `border-surface-warm-white/10 bg-surface-warm-white/5` row. Bump border `/10` → `/12`. The key/label is primary (opaque — confirm, no change if already opaque). The value/description at `/40` (around line 68) is secondary → `/70`:

```tsx
<div
  className="flex items-center justify-between gap-spacing-3 rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-3 text-sm"
>
  {/* primary label — opaque */}
  <p className="text-surface-warm-white/70">{/* value/description */}</p>
</div>
```

- [ ] **Step 3: Fix the edit/save buttons (segmented controls)**

Around line 78 and 108: `border border-surface-warm-white/15 ... px-spacing-3 py-spacing-2 text-sm` buttons. Controls — keep `/15`; make enabled text opaque (add `text-surface-warm-white` if missing). Target for line 78:

```tsx
: "rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm text-surface-warm-white"
```

And line 108 (the `mt-spacing-3 rounded-radius-md bg-surface-warm-white/15 ...` save button — active/primary control, keep `/15` fill, opaque text):

```tsx
className="mt-spacing-3 rounded-radius-md bg-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm text-surface-warm-white"
```

- [ ] **Step 4: Fix the value input**

Around line 89: `w-32 rounded-radius-md border border-surface-warm-white/15 bg-surface-warm-white/5 px-spacing-2 py-spacing-1 text-sm`. Input — keep `/15` border (inputs use the slightly stronger stroke per the table); make its text opaque so typed values read clearly:

```tsx
className="w-32 rounded-radius-md border border-surface-warm-white/15 bg-surface-warm-white/5 px-spacing-2 py-spacing-1 text-sm text-surface-warm-white"
```

- [ ] **Step 5: Verify**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/_main.admin.settings.tsx
git commit -m "fix(admin): settings page text/border contrast

Config-row borders /10 -> /12, value/description /40 -> /70, control
and input text opaque so typed values and buttons read clearly."
```

---

## Task 7: Final gate + visual verification

**Files:** None modified — verification only.

- [ ] **Step 1: Run the full local gate**

Run: `bun run check`
Expected: PASS (format/lint/typecheck/`test:changed`/Knip all green). If anything fails, fix only the failing item — do not reformat unrelated files.

- [ ] **Step 2: Visual check in browser**

With `bun run dev` running, open each route and confirm readability against the `#151515` background:
- `http://localhost:3000/admin` — stat-tile labels and values clear; active tab unambiguous; list rows readable.
- `http://localhost:3000/admin/users` — emails and metadata readable; pagination buttons clearly enabled/disabled.
- `http://localhost:3000/admin/waitlist` — business names, descriptions, metadata all readable.
- `http://localhost:3000/admin/transactions` — filter buttons, rows, payment numbers readable.
- `http://localhost:3000/admin/settings` — config labels, values, inputs, save button all readable.

If any surface still reads faded, apply the same rule (primary → opaque, secondary → `/70`, card border → `/12`) to the offending element and re-check.

- [ ] **Step 3: Confirm clean git state**

Run: `git status`
Expected: clean working tree (all six fix commits landed on `dev`).

---

## Self-review

**Spec coverage:** Spec lists 6 files (AdminTabs + 5 routes). Tasks 1-6 cover each, one per file. Spec's fix table (primary→opaque, secondary→/70, card border /10→/12, inactive tab /60→/70, active tab opaque, controls keep /15, disabled keeps `opacity-40`) is applied in every task. Task 7 = spec's Verification section. No gaps.

**Placeholder scan:** No "TBD"/"TODO"/"add appropriate"/"similar to Task N". Every code step shows the exact target className. Tasks 3-6 start with "Read the file" because line numbers may drift from the committed snapshot — the exact strings to find are given instead of relying on line numbers alone.

**Type consistency:** No types/signatures introduced or changed — all edits are className strings on existing JSX. No cross-task type contracts to check.