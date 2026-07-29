# Workspace Mobile Polish — Design

**Date:** 2026-07-29
**Topic:** Delta on roadmap topic 4 (mobile everywhere). Foundation spec `2026-07-25-mobile-everywhere-design.md` shipped the global mobile primitives (MobileNav, MobileSheet, tier-1 audit, tier-2 device captures). Workspace was marked "polish only, no structural rewrite." This spec captures the **gaps the polish pass missed** when the workspace is opened on a phone.
**Status:** Design. Implementation after spec approval.

## Goal

Make `/projects/[id]` feel native on phones (360×640 and 390×844 and 430×932) without rewriting the workspace shell. Three concrete defects today:

1. **Duplicate tab controls** — the `WorkspaceTopBar` and the bottom mobile nav both expose Diskusi/Tampilan/Kode. On a phone the user sees two competing chrome bars, plus a useless "Komputer/HP" viewport picker (they're already on a phone).
2. **Chat bubbles break per word** — `ChatMessages` uses `[overflow-wrap:anywhere]` + 12px horizontal padding; on a 390-wide screen "panplastik" wraps to 3 lines.
3. **Code tab is unusable on mobile** — `CodeView` is a desktop layout (sidebar `280px` + Monaco) forced into a phone via `grid-rows-[auto_1fr]` and a sidebar `max-h-[38dvh]`. File list and Monaco are both squished.

Plus secondary issues: icon buttons at 36px (< 44pt touch target), composer missing safe-area inset, iframe capped at fixed 390px (too narrow on iPhone 16 Pro Max).

## Why

This is the workspace, the one surface where the user spends the most time and is the actual product. The 2026-07-25 foundation spec marked workspace "polish only" because the shell was already mobile-aware (bottom nav + safe-area + `h-dvh`). User screenshots show polish is not enough — three concrete defects break the experience on the dominant mobile form factor. Fixing these is a small, surgical delta, not a rewrite.

## Locked decisions (from brainstorming 2026-07-29)

1. **Mobile baseline = 360 + 430** (anything smaller breaks by spec; 430 covers iPhone 16 Pro Max and most modern Androids).
2. **Bottom nav is the only Diskusi/Tampilan/Kode switcher on mobile.** Top-bar tab pill is `hidden md:flex`. The top bar becomes minimal chrome on mobile (project title + share/runtime status + kebab).
3. **Kode tab on mobile = sticky file-dropdown strip + full-height Monaco.** Drop the sidebar entirely under `md:`. Desktop (`>= md`) keeps the existing sidebar.
4. **Chat bubbles: drop `[overflow-wrap:anywhere]`, use plain `break-words`, tighten padding on `< sm`.** No per-word break.
5. **Iframe viewport cap = `max-w-[min(100%,430px)]`** (was hard-coded 390). Drops the cap on `md:` (full desktop width).
6. **Composer:** `pb-[env(safe-area-inset-bottom)]`, auto-grow `rows={1}` → max ~6 on focus, `inputMode="text"`.
7. **Icon buttons in `WorkspaceTopBar` and Energy/History/Runtime cluster: 44pt on touch (`h-11 w-11`).**
8. **Viewport picker (Komputer/HP) hidden on mobile** (`md:flex`). Users don't toggle their device viewport.
9. **Annotation "Ubah" + Support/History/Energy move into a kebab → `MobileSheet`** on mobile. Use the existing primitive from the foundation spec.
10. **Swipe gesture** (Diskusi ↔ Tampilan ↔ Kode) is **gated off** when the active tab is `code` — otherwise it competes with Monaco's horizontal scroll.

## Architecture (delta, surgical)

### A. `WorkspaceTopBar` mobile collapse (`WorkspacePrimitives.tsx:91–229`)

Replace the current always-rendered tab pill + viewport picker + cluster with a mobile-aware layout:

- **`< md`:** Single row: `← back` (hidden on tab content if needed), project title truncated, runtime status pill, kebab menu button (44pt). Tap kebab → opens existing `MobileSheet` (from `src/components/ui/mobile-sheet.tsx`) with: Annotation toggle, Support link, History button, Energy button, Viewport picker (Komputer/HP — actually useful as a "preview as phone vs desktop" toggle even on a phone, since the iframe shows the user's *generated* site).
- **`>= md`:** Keep the existing layout unchanged.

### B. Bottom nav stays, but `hidden md:flex`-equivalent for top-bar tabs

In `WorkspaceShell.tsx:91–229`, change the inner tab pill `<div role="tablist" aria-label="Konten tampilan">` (lines 106–149) to `hidden md:flex`. The Komputer/HP viewport tab list (lines 182–227) becomes `hidden md:flex`. The annotation Ubah button (lines 150–163) becomes a kebab item only.

### C. Chat bubble fix (`WorkspaceShell.tsx:3274`)

Change `overflow-hidden break-words [overflow-wrap:anywhere]` → `overflow-hidden break-words`. Drop `anywhere`. Change `px-spacing-6 py-spacing-5` → `px-spacing-4 py-spacing-3 sm:px-spacing-6 sm:py-spacing-5`.

Also: chat aside `p-spacing-5` (line 2333) → `p-spacing-4 sm:p-spacing-5` so messages get more horizontal room on phones.

### D. `CodeView` mobile layout (`WorkspaceShell.tsx:3910–3945`)

Replace the desktop grid with a mobile-aware variant:

- `< md`: single column. File picker becomes a sticky top strip (`<select>` styled as a button, or a custom dropdown with sheet). No `max-h-[38dvh]` sidebar. Monaco gets full height.
- `>= md`: keep the existing sidebar (`md:grid-cols-[280px_1fr]`).

Concretely: split into two renders (or one render with `hidden md:block` sidebar + `md:hidden` mobile strip).

### E. Composer mobile polish (`WorkspaceShell.tsx:2820`, `:2907`)

- Wrapper gets `pb-[env(safe-area-inset-bottom)]`.
- `<textarea rows={3}>` becomes `rows={1}` default; auto-grow to max ~6 lines on focus. Use `autoSize` from a small inline helper, or `field-sizing: content` (CSS, when widely supported — ponytail: target `>=iOS 17.4 / Chrome 123`; fall back to a 6-line cap for older).
- `inputMode="text"` (cosmetic but signals the right keyboard).

### F. Iframe cap (`WorkspacePrimitives.tsx:464`, `ProjectSitePreview.tsx:31`)

Change `max-w-[390px]` → `max-w-[min(100%,430px)]`. On `< md` phones the iframe fills up to 430; on `>= md` it falls through to desktop behavior. On phones wider than 430 (rare) the iframe still caps at 430 — matches the user's phone preview affordance.

### G. Icon buttons → 44pt

In `WorkspaceTopBar` (`WorkspacePrimitives.tsx`): every `h-9 w-9` icon-only button → `h-11 w-11` on `< md`. Energy/History/Runtime button group: same.

### H. Swipe gesture gate (`WorkspaceShell.tsx:2336–2358`)

`handleTouchEnd` early-return when `activeTab === "code"`. Swipe only switches Diskusi ↔ Tampilan (the two genuinely-mobile surfaces). Removes Monaco scroll conflict.

## Data flow

No data changes. Pure UI. TanStack Query, `useChat`, and the existing state machine (`mode`, `mobileSurface`, `activeTab`, `viewport`, `chatCollapsed`, `previewCollapsed`) stay — they already cover what's needed.

## Error handling

- The existing `previewReadyState` (stuck/silentRecoveries) and rebuild paths stay.
- The kebab `MobileSheet` reuses the foundation's bottom-sheet primitive. Its dismiss-on-drag + Escape behavior comes for free.
- Composer auto-grow caps at 6 lines; longer input scrolls inside the textarea instead of growing.

## Testing (TDD-lite, since this is UI polish)

1. **Unit — chat bubble measure:** `tests/mobile/workspace-bubble.test.tsx` (vitest + happy-dom): render a long Indonesian word in the bubble, assert `getBoundingClientRect().width` ≤ 88% of the parent at a 360-wide container, and that the bubble does NOT contain a per-word break (count `<wbr>` or assert `whiteSpace`-derived metric).
2. **Unit — top-bar tabs hidden on mobile:** render `WorkspaceTopBar` in a 360-wide container; assert the Diskusi/Tampilan/Kode pill is `display: none` and the kebab is visible.
3. **Unit — CodeView mobile layout:** render in 360-wide; assert the sidebar `<aside>` is `display: none` and the file `<select>` (or mobile strip) is visible.
4. **Unit — iframe cap:** assert `max-w-[min(100%,430px)]` resolves to 360 in a 360-wide container, 412 in a 412-wide container, 430 in a 480-wide container.
5. **Visual — Storybook story:** new story in `WorkspaceShell.stories.tsx` for each viewport (360, 430, 768, 1280) showing Diskusi / Tampilan / Kode tabs. Used for tier-2 device capture + tier-3 human review.
6. **E2E (Playwright, tier-2):** capture `/projects/<test-id>` at 360, 390, 430, 768. Assert no horizontal overflow (`document.documentElement.scrollWidth <= window.innerWidth`), no element with width < 44 in a tap zone (top-bar buttons). Screenshot saved to `__captures__/mobile/`.
7. **Human review (tier-3):** user reviews screenshots per the existing foundation's tier-3 process. Iterates until signed off.

## Out of scope

- Rewriting the workspace shell into a different architecture. The state machine (`mode`/`mobileSurface`/`activeTab`) stays.
- Replacing Monaco.
- New sheet primitives — `MobileSheet` from the foundation spec is reused.
- Design-token changes.
- Animations beyond what's already there (`COMPOSER_TRANSITION` blur stays; no new motion).
- Desktop changes beyond removing the duplicate-control problem on mobile.

## Open questions for implementation

- Confirm `MobileSheet` from the foundation spec is importable and ready (`src/components/ui/mobile-sheet.tsx`). If not, follow the foundation's task 1 path first.
- Confirm `field-sizing: content` baseline support; fall back to a 6-line cap if needed.
- Confirm the `select`-based file picker is acceptable UX, or whether a custom bottom-sheet file list (using `MobileSheet`) is wanted. Spec leans `<select>` for simplicity; iterate if the user disagrees.

## Risks

- **Monaco mobile load cost** — already loads eagerly. Spec leaves this out of scope; if perf becomes a complaint, follow up separately.
- **Kebab sheet on every project page** — adds a render path. Mitigation: lazy-mount the sheet (Radix Dialog handles this).
- **Tier-3 subjective loop** — same risk the foundation spec already documents. The model can't self-judge "feels native." User review gates sign-off.