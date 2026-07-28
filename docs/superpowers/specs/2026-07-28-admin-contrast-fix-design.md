# Admin UI Contrast Fix

## Problem

`/admin/*` (index, users, waitlist, transactions, settings) looks washed-out/disabled even when content is live and interactive. Screenshots show tabs, stat cards, list rows, and inputs all reading as low-contrast gray-on-gray.

## Root cause

Admin already uses the correct architecture — dark chrome (`body` is `bg-[#151515]`, set in `src/routes/__root.tsx:141`) with translucent `bg-surface-warm-white/N` fills and `border-surface-warm-white/N` hairlines, same pattern as working product surfaces (e.g. `src/components/projects/ProjectList.tsx:261`, `src/components/common/Header.tsx:13`).

The bug is opacity values, not the pattern:

- **Text is too faint.** Admin routes use `text-surface-warm-white/40`–`/60` for primary content (stat values, tab labels, list rows) — e.g. `src/routes/_main.admin.index.tsx:66,91`, `_main.admin.users.tsx:78-79`. Working surfaces use opaque `text-surface-warm-white` (100%) for primary content; reduced opacity is reserved for true metadata and never goes below `/70` (`Header.tsx:36` uses `/70`).
- **Active tab state is too close to inactive.** `AdminTabs.tsx:30-31`: active is `bg-surface-warm-white/15` with default text opacity, inactive is `/60` text — not enough visual gap to read as "selected" (confirmed in screenshot 1).
- **Card fill opacity (`/5`) is actually fine** — matches working cards (`ProjectList.tsx` uses `/[0.045]`–`/8`). It only looks broken because it's paired with faded text.
- **Borders are on the faint end** — admin uses `/10`, working inputs use `/12` (`ProjectList.tsx:207`).

## Fix (contrast tokens only — no layout/architecture change)

Apply consistently across `src/components/admin/AdminTabs.tsx` and all five `src/routes/_main.admin.*.tsx` files:

| Element | Current | Fixed |
|---|---|---|
| Primary text (stat values, tab labels, list primary line, table cells) | `text-surface-warm-white/40`–`/60` | `text-surface-warm-white` (opaque) |
| Secondary/metadata text (timestamps, emails, sub-labels, helper text) | `text-surface-warm-white/40`–`/60` | `text-surface-warm-white/70` (floor — never lower) |
| Card/row border | `border-surface-warm-white/10` | `border-surface-warm-white/12` |
| Card/row fill | `bg-surface-warm-white/5` | unchanged |
| Inactive tab text | `text-surface-warm-white/60` | `text-surface-warm-white/70` |
| Active tab | `bg-surface-warm-white/15` + default text | `bg-surface-warm-white/15` + opaque text, keep as the clear "selected" signal |
| Buttons/pills/status chips | same faded pattern | opaque text, same border bump |

No new colors, no new components, no DESIGN.md changes — this reuses the existing `surface-warm-white` token at corrected opacities, consistent with the rest of the product (dark chrome is the confirmed product norm, not an admin-only quirk).

## Scope

Files touched (mechanical, same fix repeated):
- `src/components/admin/AdminTabs.tsx`
- `src/routes/_main.admin.index.tsx`
- `src/routes/_main.admin.users.tsx`
- `src/routes/_main.admin.waitlist.tsx`
- `src/routes/_main.admin.transactions.tsx`
- `src/routes/_main.admin.settings.tsx`

No new files, no schema/data changes, no new Storybook entries (no new reusable component introduced — these are route-local markup tweaks).

## Verification

- Visual: reload each `/admin/*` tab in browser, confirm text/borders read clearly against `#151515` background, active tab is unambiguous.
- `bun run check` (format/lint/typecheck) — no logic changes expected to break tests.
