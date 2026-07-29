# Workspace Mobile Panel Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the mobile/tablet workspace showing a letterboxed resizable split (both panels partially visible) and the dead kebab menu button. Split into two clean, independent render trees — plain full-screen toggle for `< lg`, resizable panel group for `>= lg`.

**Architecture:** Extract chat/preview JSX into variables once, then conditionally render a simple `<div>` toggle (mobile) or a `ResizablePanelGroup` (desktop) based on a new `useIsDesktopViewport()` hook — not via CSS class overrides on a shared library instance. Wire the kebab button to the existing `MobileSheet` primitive with the desktop-cluster controls (viewport picker, annotation, Support, History, Energy, Runtime).

**Tech Stack:** Bun, TypeScript, React 18+, TanStack Router, Tailwind v4, Framer Motion, Radix Dialog (via `MobileSheet`), vitest + happy-dom, Storybook (tier-2 visual verification).

**Spec:** `docs/superpowers/specs/2026-07-29-workspace-mobile-panel-split-design.md`

## Global Constraints

- Atomic commits to `dev`; conventional-commit; body ≤100 chars; `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Visible product copy Indonesian; code/comments English. PRINCIPLES.md self-explanatory-code rule.
- TDD for non-trivial logic; UI-only changes (composer safe-area, iframe cap) skip test-gate and rely on tier-2 Playwright/dev captures.
- Pre-commit runs `bun run check:commit`; CI runs `bun run verify`. Never bypass a failing gate.
- No new dev deps. No modification to `vitest.config.ts`. No `.env` changes.
- Branch: dev. Working dir: /mnt/data/code/side/umkmcepat.

---

## File Structure

- **Create** `src/lib/use-is-desktop-viewport.ts` — minimal `matchMedia` hook for `(min-width: 1024px)`, SSR-safe (default false).
- **Modify** `src/components/projects/WorkspaceShell.tsx` — extract JSX variables + conditional tree + integrate the new hook.
- **Modify** `src/components/projects/WorkspacePrimitives.tsx` — wire kebab `onClick` → `isMobileMenuOpen` state → `MobileSheet` with desktop cluster content.
- **Modify** `src/components/projects/WorkspaceShell.test.ts` — add test for single-tree mount at mobile viewport.
- **Create** `src/components/projects/WorkspacePrimitives.test.ts` (extend existing) — add test for kebab opens sheet + sheet contents.
- **Modify** `src/components/projects/WorkspaceShell.test.tsx` (Storybook stories, if applicable — skip tier-2 until live server is available).

---

### Task 1: `useIsDesktopViewport` hook + test

**Files:**
- Create: `src/lib/use-is-desktop-viewport.ts`
- Create: `src/lib/use-is-desktop-viewport.test.ts`

**Interfaces:**
- Produces: `export function useIsDesktopViewport(): boolean` — returns `true` when viewport ≥ 1024px, SSR-safe (default `false`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/use-is-desktop-viewport.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useIsDesktopViewport } from "./use-is-desktop-viewport";

describe("useIsDesktopViewport", () => {
  it("returns true when viewport width is >= 1024px", () => {
    const matchMedia = vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      matches: (query.match(/min-width:\s*(\d+)/)?.[1] ?? "0") <= "1024",
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", matchMedia);

    const { result } = renderHook(() => useIsDesktopViewport());
    expect(result.current).toBe(true);
  });

  it("returns false when viewport width is < 1024px", () => {
    const matchMedia = vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", matchMedia);

    const { result } = renderHook(() => useIsDesktopViewport());
    expect(result.current).toBe(false);
  });

  it("updates when viewport crosses the breakpoint", () => {
    let listener: ((e: { matches: boolean }) => void) | null = null;
    const matchMedia = vi.fn().mockImplementation((_query: string) => ({
      addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
        listener = cb;
      },
      matches: false,
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", matchMedia);

    const { result, rerender } = renderHook(() => useIsDesktopViewport());
    expect(result.current).toBe(false);

    act(() => {
      listener?.({ matches: true });
    });
    rerender();
    expect(result.current).toBe(true);

    act(() => {
      listener?.({ matches: false });
    });
    rerender();
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/use-is-desktop-viewport.test.ts`
Expected: FAIL — `Cannot find module './use-is-desktop-viewport'`

- [ ] **Step 3: Write the hook implementation**

Create `src/lib/use-is-desktop-viewport.ts`:

```ts
import { useEffect, useState } from "react";

const QUERY = "(min-width: 1024px)";

export function useIsDesktopViewport(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    setIsDesktop(mql.matches);

    function onChange(e: MediaQueryListEvent) {
      setIsDesktop(e.matches);
    }
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/use-is-desktop-viewport.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Run full unit suite to confirm no regressions**

Run: `bunx vitest run --project unit`
Expected: all existing tests pass, new hook test passes

- [ ] **Step 6: Commit**

```bash
git add src/lib/use-is-desktop-viewport.ts src/lib/use-is-desktop-viewport.test.ts
git commit -m "feat(mobile): add useIsDesktopViewport hook

SSR-safe matchMedia hook for (min-width: 1024px). Returns false
during SSR and on mobile, true on desktop. Used by workspace shell
to conditionally render ResizablePanelGroup only on >=lg.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Extract chat/preview JSX into variables + conditional tree

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx` — extract JSX + replace the `ResizablePanelGroup` block with a conditional tree

**Interfaces:**
- Consumes: `useIsDesktopViewport()` from Task 1.
- Produces: two JSX variables (`chatPanelContent`, `previewPanelContent`) and a conditional `return` path.

**Step-by-step:**

- [ ] **Step 1: Import `useIsDesktopViewport`**

At the top of `WorkspaceShell.tsx`, add:

```ts
import { useIsDesktopViewport } from "@/lib/use-is-desktop-viewport";
```

- [ ] **Step 2: Call the hook before the return**

Inside `WorkspaceShell`, after the existing hook calls (~line 300), add:

```ts
const isDesktop = useIsDesktopViewport();
```

- [ ] **Step 3: Extract JSX variables immediately before the `return`**

The `return` keyword is currently at line 2375. Before it, insert two `const` declarations:

```tsx
// Content blocks extracted once so both the mobile full-screen tree
// and the desktop resizable tree reference the same JSX without
// duplicating 200+ lines of markup. Only one block renders per
// breakpoint (conditional mount guard below).
const chatPanelContent = (
  <aside className={chatPanelClass}>
    ...
  </aside>
);
const previewPanelContent = (
  ...
);
```

**IMPORTANT:** The full text is too long to paste here — use the existing JSX inside `<ResizablePanel id="chat">` (from the opening `<aside>` through the closing `</aside>`) as `chatPanelContent`, and the JSX inside `<ResizablePanel id="preview">` (from `<section className={previewPanelClass}>` through `</section>`) as `previewPanelContent`. Exact line ranges: read `src/components/projects/WorkspaceShell.tsx` lines 2433–2993 for the chat block and lines 3015–3117 for the preview block. Copy them verbatim into the two variables, then **delete** the inner JSX from the original `<ResizablePanel>` tags (but keep the `<ResizablePanel>` wrapper tags themselves — step 4 will restructure the tree).

- [ ] **Step 4: Replace the `ResizablePanelGroup` block with a conditional tree**

Replace the entire block from `<ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1 overflow-hidden !flex-col lg:!flex-row">` through `</ResizablePanelGroup>` (inclusive) with:

```tsx
      {/* Mobile/tablet: single full-screen surface toggled by bottom nav */}
      {!isDesktop ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          {mobileSurface === "chat" && chatPanelContent}
          {(mobileSurface === "preview" && showPreviewPanel) ? previewPanelContent : null}
        </div>
      ) : null}

      {/* Desktop: side-by-side resizable panels */}
      {isDesktop ? (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1 overflow-hidden">
          <ResizablePanel
            id="chat"
            panelRef={chatPanelRef}
            defaultSize={showPreviewPanel ? "25%" : "100%"}
            minSize="20%"
            collapsible
            collapsedSize={0}
          >
            {chatPanelContent}
          </ResizablePanel>
          {showPreviewPanel ? (
            <>
              <ResizableHandle withHandle className="bg-surface-warm-white/8 transition-colors hover:bg-surface-warm-white/16" />
              <ResizablePanel
                id="preview"
                panelRef={previewPanelRef}
                defaultSize="75%"
                minSize="8%"
                collapsible
                collapsedSize={0}
              >
                {previewPanelContent}
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      ) : null}
```

Key differences from the current code:
- **No `className` prop on `ResizablePanel`** — the old `max-lg:hidden` / `max-lg:!flex-1` / `transition-[flex-grow]` stuff is GONE. Desktop panels render at their intrinsic sizing without mobile workarounds.
- **`ResizableHandle` has no `max-lg:hidden`** — it only exists inside the `isDesktop` branch.
- **`ResizablePanelGroup` has no `!flex-col lg:!flex-row`** — it only exists when `isDesktop` is true; it renders with its natural `orientation="horizontal"` unchanged.
- **The `VisualFeedbackWidget`, if visible, remains at the end of the return**, after both mobile and desktop trees (it's already a sibling of `ResizablePanelGroup`, not a child).

- [ ] **Step 5: Run existing workspace tests to confirm no regressions**

Run: `bunx vitest run src/components/projects/WorkspaceShell.test.ts`
Expected: all PASS (existing tests cover `chatBubbleClass`, `canStartBuild`, `resolveDiscussResume`, etc. — JSX extraction doesn't touch those).

- [ ] **Step 6: Run `bun run check`**

Run: `bun run check`
Expected: all green (format, lint, typecheck, affected tests, knip).

- [ ] **Step 7: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx
git commit -m "fix(mobile): split workspace into separate mobile and desktop trees

Extract chat/preview JSX into variables. Render plain full-screen
toggle on <lg via mobileSurface state, ResizablePanelGroup only on
>=lg. No more CSS overrides fighting the library's inline styles.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Kebab menu wiring — `WorkspaceTopBar` kebab → `MobileSheet`

**Files:**
- Modify: `src/components/projects/WorkspacePrimitives.tsx` — add `isMobileMenuOpen` state + `MobileSheet` + sheet content

- [ ] **Step 1: Add imports**

At the top of `WorkspacePrimitives.tsx`, add:

```ts
import { useState } from "react";
```

And import `MobileSheet`:

```ts
import { MobileSheet } from "@/components/ui/mobile-sheet";
```

(`useState` may already be present — check first. If it is, don't dupe.)

- [ ] **Step 2: Add `isMobileMenuOpen` state inside `WorkspaceTopBar`**

After the function opening, add:

```tsx
const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
```

- [ ] **Step 3: Wire kebab button with `onClick`**

Replace lines 169-175 (the kebab button, current `aria-label="Buka menu"`) with:

```tsx
        <button
          type="button"
          aria-label="Buka menu"
          aria-haspopup="dialog"
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen(true)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-radius-md border border-surface-warm-white/10 text-surface-warm-white/70 hover:bg-surface-warm-white/8 hover:text-surface-warm-white cursor-pointer"
        >
          <Menu className="size-4" />
        </button>
```

- [ ] **Step 4: Add `MobileSheet` after the top-bar wrapper `<div>`**

At the end of the `WorkspaceTopBar` return block, after the closing `</div>` of the desktop cluster (line 242), add:

```tsx
      <MobileSheet
        open={isMobileMenuOpen}
        onOpenChange={setIsMobileMenuOpen}
        title="Menu"
      >
        <div className="flex flex-col gap-spacing-3">
          {annotationAvailable && activeTab === "preview" ? (
            <button
              type="button"
              onClick={() => {
                onToggleAnnotation?.();
                setIsMobileMenuOpen(false);
              }}
              aria-label={annotationActive ? "Nonaktifkan ubah" : "Aktifkan ubah"}
              aria-pressed={annotationActive}
              className={`inline-flex items-center gap-spacing-2 rounded-radius-md border px-spacing-3 py-spacing-3 text-sm ${annotationActive ? "border-[#8fd3ff]/35 bg-[#8fd3ff]/12 text-[#d6f0ff]" : "border-surface-warm-white/10 text-surface-warm-white hover:bg-surface-warm-white/8"}`}
            >
              <MessageSquarePlus className="size-4" />
              <span>{annotationActive ? "Ubah aktif" : "Ubah"}</span>
            </button>
          ) : null}
          {activeTab === "preview" ? (
            <div role="tablist" aria-label="Tampilan viewport" className="flex items-center gap-spacing-2">
              <span className="text-xs text-surface-warm-white/44">Tampilan:</span>
              <button
                type="button"
                role="tab"
                aria-selected={viewport === "desktop"}
                onClick={() => { setViewport("desktop"); setIsMobileMenuOpen(false); }}
                className={`inline-flex items-center gap-spacing-2 rounded-radius-md border px-spacing-3 py-spacing-2 text-sm ${viewport === "desktop" ? "border-surface-warm-white/20 bg-surface-warm-white/10 text-surface-warm-white" : "border-surface-warm-white/10 text-surface-warm-white/64 hover:bg-surface-warm-white/8"}`}
              >
                <Monitor className="size-4" />
                Komputer
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewport === "mobile"}
                onClick={() => { setViewport("mobile"); setIsMobileMenuOpen(false); }}
                className={`inline-flex items-center gap-spacing-2 rounded-radius-md border px-spacing-3 py-spacing-2 text-sm ${viewport === "mobile" ? "border-surface-warm-white/20 bg-surface-warm-white/10 text-surface-warm-white" : "border-surface-warm-white/10 text-surface-warm-white/64 hover:bg-surface-warm-white/8"}`}
              >
                <Smartphone className="size-4" />
                HP
              </button>
            </div>
          ) : null}
          <hr className="border-surface-warm-white/10" />
          {projectId ? (
            <a
              href="/support"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setIsMobileMenuOpen(false)}
              className="inline-flex items-center gap-spacing-2 rounded-radius-md px-spacing-3 py-spacing-3 text-sm text-surface-warm-white/70 hover:bg-surface-warm-white/8"
            >
              <LifeBuoy className="size-4" />
              Hubungi Dukungan
            </a>
          ) : null}
          {projectId ? <WorkspaceHistoryButton projectId={projectId} /> : null}
          {projectId ? <EnergyLedgerButton projectId={projectId} /> : null}
          {runtime ? <RuntimeControl runtime={runtime} /> : null}
        </div>
      </MobileSheet>
```

- [ ] **Step 5: Run the existing top-bar tests**

Run: `bunx vitest run src/components/projects/WorkspacePrimitives.test.ts`
Expected: all PASS (existing tests assert kebab is visible — this adds behavior without changing visibility).

- [ ] **Step 6: Run `bun run check`**

Run: `bun run check`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/components/projects/WorkspacePrimitives.tsx
git commit -m "feat(mobile): wire kebab menu to MobileSheet in workspace top bar

Tapping the Buka menu button now opens a bottom sheet with viewport
picker, annotation toggle, Support link, History, Energy, and Runtime
controls — the same controls permanently visible on the desktop
cluster, now accessible from the mobile collapsed top bar.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Single-tree mount assertion test

**Files:**
- Modify: `src/components/projects/WorkspaceShell.test.ts` (existing)

- [ ] **Step 1: Add the mobile-only-mount test**

Since `useIsDesktopViewport` relies on `window.matchMedia`, which vitest's `environment: "node"` does NOT provide, we assert via CSS class enumeration on the rendered HTML. The mobile/desktop trees carry distinguishing CSS classes:
- Mobile tree: `<div className="min-h-0 flex-1 overflow-hidden lg:hidden">`
- Desktop tree: `<ResizablePanelGroup ... className="hidden ... lg:flex">`

The test: render `WorkspaceShell` with necessary context mocking, capture the HTML, assert the mobile `lg:hidden` div is present and the desktop `ResizablePanelGroup` wrapper is either absent from the string or also `hidden`. Since `environment: "node"` can't run `matchMedia`, the hook defaults to `false` (mobile), so the mobile tree renders and the desktop tree does not.

Add to `src/components/projects/WorkspaceShell.test.ts`:

```ts
import { useIsDesktopViewport } from "@/lib/use-is-desktop-viewport";

// Stub the hook so it returns exactly what we ask. The real hook
// needs window.matchMedia which node env does not provide.
vi.mock("@/lib/use-is-desktop-viewport", () => ({
  useIsDesktopViewport: vi.fn(() => false),
}));

// ... later in the test block:

describe("workspace panel split", () => {
  it("renders mobile tree and not desktop tree when viewport < 1024px", () => {
    // default stub returns false (mobile)
    const { container } = render(
      // Wrap in a minimal provider mocks context. Use whatever existing
      // test utilities the file already sets up for rendering WorkspaceShell
      // children — e.g. QueryClientProvider, a mock auth context, etc.
      // If rendering the full WorkspaceShell is too heavy, render a component
      // that exercises just the conditional tree.
    );
    // Mobile tree carries lg:hidden class on its flex-1 wrapper.
    // Desktop tree's ResizablePanelGroup output should be absent (null).
    expect(container.innerHTML).toContain("lg:hidden");
    expect(container.innerHTML).not.toContain("ResizablePanelGroup");
  });
});
```

**NOTE:** `vi.mock` is hoisted to the top of the file by vitest. Place the mock at the top of the test file after the existing imports, and define the stubbed function as `fn(() => false)` in the mock's factory. If the test file relies on WorkspaceShell's internal implementation details that make full component rendering impractical in `environment: "node"` (e.g., `react-resizable-panels` integration, motion components), **reference the existing test's mocking strategy** — the file already mocks several imports for `chatBubbleClass` and `resolveDiscussResume` tests. Follow the same pattern.

- [ ] **Step 2: Run the test**

Run: `bunx vitest run src/components/projects/WorkspaceShell.test.ts`
Expected: new test PASSES alongside existing tests.

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/WorkspaceShell.test.ts
git commit -m "test(mobile): assert single tree render at mobile viewport

Adds a test that when useIsDesktopViewport returns false, only the
mobile full-screen tree renders and the desktop ResizablePanelGroup
is absent from the DOM — prevents the double-mount regression that
the previous CSS-override approach caused.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Verify + push + handoff

- [ ] **Step 1: `bun run check`**

All green: format, lint, typecheck, affected tests, knip.

- [ ] **Step 2: `bun run verify`**

All green: format, lint, typecheck, full unit tests, knip, route regen.

- [ ] **Step 3: `git push origin dev`**

- [ ] **Step 4: Tier-3 review handoff**

Report to the user: what shipped, what to verify visually (open a workspace project at 390px in browser DevTools — Diskusi fills screen, Tampilan fills screen, Kode fills screen, no split, no letterboxing; kebab opens sheet with controls). This is the same tier-3 flow from the foundation spec — the model cannot self-judge native-feel; the user signs off on screenshots.

