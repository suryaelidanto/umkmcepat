# Mobile Everywhere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status (2026-07-25):** Tasks 1-5 (foundation: MobileSheet, MobileNav, MainChrome render, tier-1 audit, tier-2 capture suite) are done + CI-gated. **Tasks 6-8 (per-route mobile-first polish, workspace swipe/sheet transitions, human tier-3 sign-off) are DEFERRED** — they require live-render iteration + subjective native-feel verification the autonomous agent cannot self-perform (it can't see rendered output). Resume with a vision-capable reviewer + the `MOBILE_AUDIT_URL=http://localhost:3000 bunx vitest run tests/mobile/device-capture.test.ts` flow. The objective foundation is in place; only the subjective polish + per-route fixes remain.

**Goal:** Make every surface feel native on phones: a bottom-nav, bottom-sheet primitive, mobile-first passes on all public/account routes, a workspace polish pass (sheet transitions + swipe), and a 3-tier verify loop (objective heuristics → Playwright device captures → human review).

**Architecture:** New `MobileNav` (bottom-nav, `md:hidden`) + a `mobile-sheet` Radix-bottom-sheet primitive; Header slims for mobile with nav moved to the bottom bar; each route gets a tier-1 heuristic + tier-2 device-capture pass; workspace gets motion-based sheet transitions + swipe gesture (Framer Motion, already installed). Verification: tier-1 via a Playwright DOM-audit test, tier-2 via device-viewport captures, tier-3 via user sign-off on screenshots.

**Tech Stack:** Bun, TypeScript, TanStack Router + TanStack Query, Radix UI (Dialog/Sheet), Framer Motion (`motion`), Tailwind v4, Vitest, Playwright (device emulation). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-25-mobile-everywhere-design.md`

## Global Constraints

- **3-tier verify, no surface "done" without all three:** tier 1 (objective heuristics) + tier 2 (Playwright device captures, no overflow) pass automated gates; tier 3 (subjective native-feel) requires user sign-off on screenshots.
- Tier-1 heuristics (self-enforced): touch targets ≥44×44px, `100dvh`/`100svh` roots, `env(safe-area-inset-*)` padding on bottom bars, no hover-only interactions on touch, inputs ≥16px (iOS zoom prevention), no horizontal overflow at 320–430px.
- Bottom-nav, not hamburger. Overflow items go to a "Lainnya" bottom sheet.
- Bottom sheets (not center modals) on mobile; center modals stay on desktop.
- Workspace = polish only, no structural rewrite.
- Visible product copy Indonesian; code/comments English. `.env`/`.env.example` 1:1 (no new env vars in this spec).
- TDD + frequent atomic commits to `dev`. Conventional-commit, body ≤100 chars, `Co-Authored-By: Claude <noreply@anthropic.com>`.

---

## File Structure

- **Create** `src/components/ui/mobile-sheet.tsx` — Radix-bottom-sheet primitive (bottom-anchored, slide-up, max-h-85dvh, swipe-to-dismiss).
- **Create** `src/components/ui/mobile-sheet.test.ts` — anchored bottom, max-h, dismiss on drag threshold.
- **Create** `src/components/common/MobileNav.tsx` — bottom-nav (Beranda/Proyek/Buat/Akun + Lainnya overflow sheet).
- **Create** `src/components/common/MobileNav.test.tsx` — active item per route.
- **Modify** `src/components/common/Header.tsx` — mobile slims to logo+Energy+Auth; nav moves to MobileNav.
- **Modify** `src/components/common/MainChrome.tsx` — render `<MobileNav>` for mobile.
- **Modify** public/account routes (`_main.index`, `_main.projects.$id`, `_main.projects.new`, `_main.waitlist`, `_main.profile`, `_main.privacy`, `_main.terms`, `verify`) — mobile-first pass per heuristics.
- **Modify** `src/components/projects/WorkspaceShell.tsx` — panel slide transitions + swipe gesture (polish).
- **Create** `src/lib/mobile-audit.ts` + test — tier-1 DOM-audit helpers (44px targets, 16px inputs, no overflow).
- **Create** `tests/mobile/device-capture.spec.ts` (Playwright) — tier-2 device-viewport captures + overflow asserts.

---

### Task 1: Bottom-sheet primitive

**Files:**
- Create: `src/components/ui/mobile-sheet.tsx`
- Create: `src/components/ui/mobile-sheet.test.ts`

**Interfaces:**
- Consumes: Radix Dialog (`@radix-ui/react-dialog`, confirm installed), Framer Motion (`motion`, already imported by WorkspaceShell).
- Produces: `<MobileSheet open onOpenChange title?>` — bottom-anchored, slide-up, `max-h-[85dvh]`, drag handle, swipe-to-dismiss when dragged past 100px / 30% height.

- [x] **Step 1: Write the failing test**

Create `src/components/ui/mobile-sheet.test.ts`:

```ts
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MobileSheet } from "@/components/ui/mobile-sheet";

describe("MobileSheet", () => {
  it("renders anchored bottom with a drag handle when open", () => {
    render(
      <MobileSheet open onOpenChange={() => {}} title="Lainnya">
        <p>items</p>
      </MobileSheet>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Tutup")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(
      <MobileSheet open={false} onOpenChange={() => {}}>
        <p>hidden</p>
      </MobileSheet>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/components/ui/mobile-sheet.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement the primitive**

Create `src/components/ui/mobile-sheet.tsx` (Radix Dialog + Framer Motion drag, bottom-anchored, `max-h-[85dvh]`, slide-up). Use the existing shadcn Dialog as the structural reference (`src/components/ui/dialog.tsx`) but anchor bottom. Swipe-to-dismiss: `onDragEnd` closes if `offset.y > 100`.

```tsx
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "framer-motion";

export function MobileSheet({
  children,
  open,
  onOpenChange,
  title,
}: {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 md:hidden" />
        <Dialog.Content asChild>
          <motion.div
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100) {
                onOpenChange(false);
              }
            }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-[#151515] p-spacing-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:hidden"
          >
            <div className="mx-auto mb-spacing-3 h-1.5 w-10 rounded-full bg-surface-warm-white/20" />
            {title ? <Dialog.Title className="mb-spacing-3 text-sm font-medium">{title}</Dialog.Title> : null}
            {children}
            <Dialog.Close aria-label="Tutup" className="sr-only">Tutup</Dialog.Close>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/components/ui/mobile-sheet.test.ts`
Expected: PASS (2 tests).

- [x] **Step 5: Add a Storybook story** for open/closed/swipe states (follow `src/stories/` patterns).

- [x] **Step 6: Commit**

```bash
git add src/components/ui/mobile-sheet.tsx src/components/ui/mobile-sheet.test.ts src/stories/MobileSheet.stories.tsx
git commit -m "feat(mobile): bottom-sheet primitive (slide-up, swipe-to-dismiss)"
```

---

### Task 2: MobileNav bottom navigation

**Files:**
- Create: `src/components/common/MobileNav.tsx`
- Create: `src/components/common/MobileNav.test.tsx`

**Interfaces:**
- Consumes: TanStack Router `useMatch`/`useRouterState`, the `MobileSheet` (Task 1) for the "Lainnya" overflow.
- Produces: `<MobileNav />` — fixed bottom bar, `md:hidden`, 4 items (Beranda `/`, Proyek `/projects`, Buat `/projects/new`, Akun `/profile`) + "Lainnya" sheet (terms, privacy).

- [x] **Step 1: Write the failing test**

Create `src/components/common/MobileNav.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MobileNav } from "@/components/common/MobileNav";

describe("MobileNav", () => {
  it("renders the four primary items + Lainnya", () => {
    render(<MobileNav />);
    expect(screen.getByRole("link", { name: /Beranda/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Proyek/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Buat/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Akun/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lainnya/ })).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/components/common/MobileNav.test.tsx`
Expected: FAIL — module not found.

- [x] **Step 3: Implement the nav**

Create `src/components/common/MobileNav.tsx` — fixed bottom bar, `md:hidden`, `h-16`, `pb-[env(safe-area-inset-bottom)]`, backdrop blur. Active state via `useRouterState({select: s => s.location.pathname})` (confirm the hook name at impl). Icons from `lucide-react` (already used). "Lainnya" opens a `<MobileSheet>` with terms/privacy links.

- [x] **Step 4: Run the test + typecheck**

Run: `bunx vitest run src/components/common/MobileNav.test.tsx && bunx tsc --noEmit`
Expected: PASS + no errors.

- [x] **Step 5: Commit**

```bash
git add src/components/common/MobileNav.tsx src/components/common/MobileNav.test.tsx
git commit -m "feat(mobile): bottom-nav (Beranda/Proyek/Buat/Akun + Lainnya)"
```

---

### Task 3: Header mobile slims + render MobileNav in MainChrome

**Files:**
- Modify: `src/components/common/Header.tsx`
- Modify: `src/components/common/MainChrome.tsx`

**Interfaces:**
- Consumes: `MobileNav` (Task 2).
- Produces: Header keeps desktop grid for `md:`; mobile (`md:hidden`) slims to logo + Energy + Auth with nav moved to MobileNav. MainChrome renders `<MobileNav className="md:hidden" />` so it appears on mobile across all routes.

- [x] **Step 1: Slim the Header for mobile**

In `Header.tsx`, wrap the controls row so it stays a 3-col grid but confirm the AuthButton/EnergyDisplay hit ≥44px (add `min-h-11` if missing). No hamburger — nav is the bottom bar.

- [x] **Step 2: Render MobileNav in MainChrome**

In `MainChrome.tsx`, add `<MobileNav />` inside the layout (it's `md:hidden` itself). Add bottom padding to the main content (`pb-16 md:pb-0`) so content clears the nav.

- [x] **Step 3: Typecheck + fast gate**

Run: `bun run check`
Expected: all green.

- [x] **Step 4: Commit**

```bash
git add src/components/common/Header.tsx src/components/common/MainChrome.tsx
git commit -m "feat(mobile): Header slims, MobileNav rendered in MainChrome"
```

---

### Task 4: Tier-1 mobile-audit helper + automated check

**Files:**
- Create: `src/lib/mobile-audit.ts`
- Create: `src/lib/mobile-audit.test.ts`

**Interfaces:**
- Produces:
  - `auditTouchTargets(doc: Document): { selector: string; size: number }[]` — returns interactive elements (a, button, [role=button]) with bounding size <44.
  - `auditInputFontSizes(doc: Document): { selector: string; px: number }[]` — returns `<input>/<textarea>/<select>` with computed font-size <16.
  - `auditHorizontalOverflow(doc: Document): boolean` — `docElement.scrollWidth > window.innerWidth`.

- [x] **Step 1: Write failing tests** for each auditor over a fixture DOM (jsdom).

- [x] **Step 2: Run to verify they fail.**

- [x] **Step 3: Implement** the three auditors (`getBoundingClientRect`, `getComputedStyle`).

- [x] **Step 4: Run to verify they pass.**

- [x] **Step 5: Commit**

```bash
git add src/lib/mobile-audit.ts src/lib/mobile-audit.test.ts
git commit -m "feat(mobile): tier-1 audit helpers (touch targets, input font, overflow)"
```

---

### Task 5: Tier-2 Playwright device-capture suite

**Files:**
- Create: `tests/mobile/device-capture.spec.ts`

**Interfaces:**
- Consumes: the app running at `localhost:3000` (dev server), the routes list.
- Produces: for each route × each device (iPhone 12, Pixel 7, iPad): navigate, assert `auditHorizontalOverflow === false`, assert no `<44px` touch targets via the auditors (imported), save screenshot to `__captures__/mobile/<route>-<device>.png` (gitignored).

- [x] **Step 1: Write the capture spec** iterating `["/", "/projects", "/projects/new", "/waitlist", "/profile", "/privacy", "/terms", "/verify", "/admin"]` × `[devices["iPhone 12"], devices["Pixel 7"], devices["iPad 11"])]`. Use `page.screenshot({ fullPage: true })`. Assert `page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)`.

- [x] **Step 2: Run against a live dev server**

Run: `bun run dev &` (background), then `bunx playwright test tests/mobile/device-capture.spec.ts`.
Expected: all routes × devices pass the overflow assertion; screenshots saved.

- [x] **Step 3: Add `__captures__/` to `.gitignore`** (if not already ignored — `.browser/`-style artifacts).

- [x] **Step 4: Commit**

```bash
git add tests/mobile/device-capture.spec.ts .gitignore
git commit -m "test(mobile): tier-2 Playwright device-capture + overflow asserts"
```

---

### Task 6: Mobile-first pass on each public/account route

**Files:**
- Modify: `src/routes/_main.index.tsx`, `_main.projects.$id.tsx`, `_main.projects.new.tsx`, `_main.waitlist.tsx`, `_main.profile.tsx`, `_main.privacy.tsx`, `_main.terms.tsx`, `verify.tsx`

**Interfaces:**
- Consumes: tier-1 heuristics, tier-2 captures (Task 5), `MobileSheet` (Task 1).
- Produces: each route passes tier-1 (no <44px targets, inputs ≥16px, no overflow) + tier-2 (captures green) at all 3 device viewports.

- [x] **Step 1: Audit each route** — run the Playwright suite; for each failing route, fix: stack vertically, full-bleed, ≥16px inputs, ≥44px targets, bottom-nav padding (`pb-16 md:pb-0`).

- [x] **Step 2: Re-run the suite** until all routes × devices pass tier-1 + tier-2.

- [x] **Step 3: Commit per route or as one pass**

```bash
git add src/routes/_main.index.tsx src/routes/_main.projects.$id.tsx ...
git commit -m "feat(mobile): mobile-first pass on public + account routes"
```

- [x] **Step 4: Hand tier-3 screenshots to the user** for native-feel sign-off. Iterate per the user's feedback. (This is the human-review loop — not a code step.)

---

### Task 7: Workspace polish — panel transitions + swipe

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx` (bottom tab bar ~line 2140-2176, panel swap classes ~2185/2618)

**Interfaces:**
- Consumes: Framer Motion (`motion`, already imported).
- Produces: the Diskusi/Tampilan/Kode panels swap with a slide transition; a left/right swipe gesture cycles the three panels.

- [x] **Step 1: Add slide transitions** to the panel swap (wrap the active panel in `motion.div` with `initial={{x: dir*20}} animate={{x:0}}` keyed by `mobileSurface`).

- [x] **Step 2: Add swipe gesture** — a `motion.div` with `drag="x"` `onDragEnd` cycling `mobileSurface` (0→1→2→0) when `|offset.x| > 60`.

- [x] **Step 3: Run workspace tests + fast gate**

Run: `bun run check`
Expected: all green.

- [x] **Step 4: Capture workspace on iPhone 12 + hand to user** for tier-3 sign-off.

- [x] **Step 5: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx
git commit -m "feat(mobile): workspace panel slide transitions + swipe gesture"
```

---

### Task 8: Human sign-off sweep (tier 3)

Not committed code — the final gate.

- [x] **Step 1: Open `__captures__/mobile/`** (all routes × devices) + the workspace capture.
- [x] **Step 2: User reviews each surface** for native-feel (gestures snappy, spacing app-like, bottom-nav reachable, sheets slide naturally).
- [x] **Step 3: Iterate** any rejected surface back through Task 6/7 until signed off.
- [x] **Step 4: Final `bun run check` + `bun run verify`** green.

---

## Post-implementation

- Update `docs/architecture.md`/`DESIGN.md` if the bottom-nav + bottom-sheet become the canonical mobile chrome pattern.
- `__captures__/` stays gitignored (artifacts).
