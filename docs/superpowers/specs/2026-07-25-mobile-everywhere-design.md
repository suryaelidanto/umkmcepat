# Mobile Everywhere — Design

**Date:** 2026-07-25
**Topic:** 4 of the eight-topic roadmap (see `umkmcepat-eight-topic-roadmap` memory)
**Status:** Design approved; pending plan + implementation. **Highest-risk topic** — see Verify Model.

## Goal

Make every surface feel like a native mobile app on phones: the public surfaces (landing, header/nav, project list, waitlist, admin, profile, privacy, terms, verify) and a polish pass on the already-mobile-aware workspace (builder). Native-feel gestures, bottom navigation, sheet transitions, and zero desktop-only affordances. The workspace is already mobile-native (bottom tab bar, safe-area, `h-dvh`); the gaps are the public + account chrome.

## Why

The workspace is the one mobile-aware surface; everything else is desktop-first. The Header has no nav links, no hamburger, no mobile menu — on a phone it just squishes the logo + two controls into a row with no navigation. The landing, project list, waitlist, admin, and profile pages use `sm:`/`lg:` padding tweaks but no mobile navigation or native-feel patterns. This is the gap.

## Honest constraint — the verify model

**The session model (glm-5.2) cannot see rendered output.** It cannot self-judge "does this feel native." So verification splits into three tiers:

1. **Objective (self-enforced, automated):** viewport coverage (`100dvh`/`100svh`), safe-area insets (`env(safe-area-inset-*)`), no hover-only interactions, touch-target ≥44×44px, no horizontal overflow at 320–430px widths, bottom-nav present on mobile, font-size ≥16px on inputs (prevents iOS zoom-on-focus), `touch-action` correctness.
2. **Semi-objective (automated via Playwright device emulation):** render each surface at iPhone 12 (390×844), Pixel 7 (412×915), iPad (810×1080) viewports; assert no overflow, no clipped content, no 0-size touch targets. Captured as screenshots.
3. **Subjective native-feel (HUMAN REVIEW):** the screenshots from tier 2 are handed to the user, who confirms "feels native" or directs iteration. The model cannot verify this tier alone — it is a baked-in review loop, not a blocker. Multiple iteration rounds are expected.

This spec does NOT declare "mobile done" until the user signs off on the tier-3 subjective review for each surface.

## Decisions (locked during brainstorming)

1. **Scope = everything, incl. a workspace polish pass.** Public + account surfaces are the real gaps; the workspace gets a native-feel polish pass (gestures, sheet transitions) on top of its existing mobile-aware layout.
2. **Human-review loop on device captures.** Playwright device-viewport screenshots per surface → user confirms native-feel. The model enforces tiers 1–2; the user owns tier 3.
3. **Bottom navigation, not hamburger.** A mobile bottom-nav (Beranda / Proyek / Buat / Akun) is the primary mobile navigation — matches native app patterns and is reachable by thumb. A hamburger is a fallback for overflow items only (terms, privacy) if they don't fit the bottom bar; default to a "Lainnya" overflow sheet rather than a hamburger drawer.
4. **No hover-only interactions on mobile.** Any hover affordance has a visible tap equivalent on touch devices. `group-hover` reveals become tap-to-open sheets on mobile.
5. **Native-feel patterns: bottom sheets, not modals.** Mobile uses bottom-sheet transitions (Radix Dialog anchored bottom, `slide-up`), full-bleed panels, and swipe-to-dismiss where the component supports it. Desktop keeps center modals.
6. **Workspace polish:** add sheet-style transitions to the existing bottom tab bar, swipe between Diskusi/Tampilan/Kode panels (gesture), and confirm the existing safe-area/`h-dvh` holds. No structural rewrite — polish only.

## Architecture

### Mobile nav (new)

New component `src/components/common/MobileNav.tsx`:

- A fixed bottom-nav, `md:hidden`, with 4 thumb-reachable items (icon + label): Beranda (`/`), Proyek (`/projects`), Buat (`/projects/new`), Akun (`/profile`).
- Safe-area padding (`pb-[env(safe-area-inset-bottom)]`), `h-16`, backdrop blur.
- Active item highlighted via TanStack Router's `useMatch`/`useLocation`.
- Overflow ("Lainnya") → bottom sheet with terms, privacy, etc. (the items that don't fit the bar).

Rendered in `MainChrome.tsx` (or `__root.tsx`) for mobile only; the desktop Header stays for `md:` up.

### Header (mobile-aware)

- Keep the existing desktop grid for `md:` up.
- On mobile (`md:hidden`): slim the header to logo + EnergyDisplay + AuthButton only (already fits), but the navigation moves to `MobileNav` (bottom). No hamburger in the header — the bottom bar is the nav.
- Confirm touch targets ≥44px on the AuthButton/EnergyDisplay.

### Surfaces — mobile-first pass

Each public/account route gets a mobile-first review against the tier-1 heuristics + tier-2 capture. The specific surfaces:

- `_main.index.tsx` (landing) — hero, features, community strip: stack vertically, full-bleed media, ≥16px copy, bottom-nav-aware bottom padding.
- `_main.projects.$id.tsx` + `_main.projects.new.tsx` (project list / new) — card list, full-width cards, bottom-nav-aware.
- `_main.waitlist.tsx` — form: full-width inputs ≥44px, sticky submit above the bottom-nav, image picker thumb-friendly.
- `_main.admin.tsx` (the new admin page from topic 3) — already specced mobile-first (stacked cards, sticky actions); this spec confirms it.
- `_main.profile.tsx`, `_main.privacy.tsx`, `_main.terms.tsx`, `verify.tsx` — content pages: readable measure, ≥16px, bottom-nav-aware padding.

### Workspace polish

`src/components/projects/WorkspaceShell.tsx` (already mobile-aware):

- Bottom tab bar (`Diskusi`/`Tampilan`/`Kode`) gets a slide transition between panels (the panels already swap via `max-md:` classes — add the motion).
- Add swipe-to-switch gesture (left/right swipe cycles the three panels) via a lightweight pointer-events handler (no new dependency; the app already uses `motion`/Framer Motion).
- Confirm `h-dvh` + safe-area hold across the panels.

### Sheet/dialog pattern

Establish one reusable bottom-sheet primitive (`src/components/ui/mobile-sheet.tsx`) built on the existing Radix Dialog, anchored bottom, `slide-up` transition, `max-h-[85dvh]`, swipe-to-dismiss via the drag handle. Used by: MobileNav overflow, waitlist image picker, admin decline-reason input, workspace history drawer (which is today a popover-style "Drawer" — upgrade to a real bottom sheet on mobile).

## Data flow

N/A — this is a UI/UX spec. The only data interaction is TanStack Router `useMatch` for active-nav state and TanStack Query for the surfaces that fetch (unchanged).

## Error handling

- Tier-1 heuristics enforced by automated checks (a `mobile-audit` test or lint rule) — failing the audit fails `bun run check`. Surfaces that violate a heuristic are blocked from merge.
- Tier-2 Playwright captures: if a surface overflows/clips at a device viewport, the test fails (objective). Fix before handoff.
- Tier-3 subjective: if the user rejects a surface's native-feel, iterate. No surface is "done" until signed off.

## Testing (TDD + device captures)

1. **Unit — MobileNav active state:** `useMatch` highlights the correct item per route.
2. **Unit — mobile-sheet primitive:** anchored bottom, max-h, swipe-to-dismiss handler fires on drag past threshold.
3. **Automated audit (tier 1):** a check that asserts no `<input>` below 16px, no touch target below 44px, no `hover:` without a tap equivalent — runnable as a lint custom rule or a DOM audit test over the route tree.
4. **Playwright device captures (tier 2):** render each surface at iPhone 12 / Pixel 7 / iPad viewports; assert no horizontal overflow (`document.documentElement.scrollWidth <= window.innerWidth`), no element with `getBoundingClientRect` width < 44 in a tap zone; save screenshots to `__captures__/mobile/` (gitignored).
5. **Human review (tier 3):** user reviews the screenshots per surface; sign-off or iterate.

## Out of scope

- Rewriting the workspace shell structure (it's already mobile-aware; polish only).
- New product features (this is responsive/native-feel polish on existing surfaces).
- Tablet-specific layouts beyond the iPad capture (phone-first; tablet inherits phone or desktop per breakpoint).
- A dedicated mobile app (this is responsive web that feels native).

## Open questions for implementation

- Confirm the exact TanStack Router hooks for active-nav state (`useMatchRoute` vs `useLocation`) at impl time.
- Confirm `motion` (Framer Motion) is the animation lib in use (the workspace already imports it) for sheet transitions + swipe gestures — no new dependency.
- The mobile-audit tier-1 check: decide between a custom ESLint rule (structural) vs a Playwright DOM audit (runtime). Lean Playwright (runtime catches real violations; lint rules miss dynamic classes).
