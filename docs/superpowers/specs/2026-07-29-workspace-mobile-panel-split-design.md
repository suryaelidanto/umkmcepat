# Workspace Mobile Panel Split — Design

**Date:** 2026-07-29
**Topic:** Second delta on roadmap topic 4 (mobile everywhere). Follows `2026-07-29-workspace-mobile-design.md` (chat bubble, composer, iframe cap, top-bar collapse, CodeView dropdown, swipe gate — all shipped). This spec fixes two defects that survived that pass: the resizable split still renders on mobile/tablet, and the mobile kebab button is dead.

**Status:** Design. Implementation after spec approval.

## Goal

On `/projects/[id]` at `< lg` (1024px): a single full-screen surface (Diskusi, Tampilan, or Kode) toggled by the bottom nav — no resizable split, no drag handle, no letterboxing. The mobile kebab button opens a bottom sheet with the controls that don't fit the collapsed top bar (viewport picker, annotation toggle, Support, History, Energy).

## Why

The previous mobile pass (`2026-07-29-workspace-mobile-design.md`, commit `94b0583`) tried to force `ResizablePanelGroup` into a column layout on mobile via Tailwind `!flex-col lg:!flex-row`. This didn't work: user screenshots show Tampilan/Kode rendering in a squeezed top third of the screen with a visible gap, then a duplicate mini-toolbar, then the actual content below — both panels partially visible at once, letterboxed.

**Root cause (confirmed against `node_modules/react-resizable-panels` source, not guessed):**

`react-resizable-panels`'s `Group` component renders `style={{..., display:"flex", flexDirection: orientation==="horizontal"?"row":"column", flexWrap:"nowrap", touchAction:...}}` — an inline style keyed off the `orientation` **prop**, not any CSS class. The library's own TypeScript docs state explicitly: *"⚠️ The following styles cannot be overridden: `display`, `flex-direction`, `flex-wrap`, and `overflow`."* Tailwind's `!flex-col` (which compiles to `flex-direction: column !important`) can technically beat a plain inline style at the CSS-cascade level, but each `Panel` child independently renders its own inline `style={{flexBasis: <percentage-of-group-main-axis>, ...}}`, computed from `defaultSize`/`minSize` **as a percentage of the group's main axis** — which the library derives from `orientation`, not from the actual rendered `flex-direction`. Forcing the group to visually stack as a column while leaving `orientation="horizontal"` means each panel's `flexBasis` percentage is still computed against **width**, but applied to a box now stacked in the **height** axis. The chat panel's `defaultSize="25%"` renders as 25% of the container height instead of being hidden, and the preview panel's `hidden`/`!flex-1` classes fight the library's own re-applied inline `flexBasis`. Two rounds of CSS patching (original `max-md:hidden` toggle, then the `!flex-col` hack) both failed for the same underlying reason: **this is not a CSS problem, it's a JS-computed-layout problem** — you cannot make a percentage-based, JS-driven horizontal splitter behave like a simple mobile stack by overriding its CSS output. Per `systematic-debugging`'s "3+ fixes failed → question the architecture" rule, the fix is structural: stop rendering `ResizablePanelGroup` at all below the breakpoint.

Separately: the mobile kebab button (`WorkspacePrimitives.tsx:169-173`) was shipped in the prior pass with no `onClick` — the task reviewer flagged this as an accepted gap ("brief did not require wiring; MobileSheet is left for a future iteration"), but no follow-up ever wired it. Users tap it and nothing happens.

## Locked decisions (from brainstorming 2026-07-29)

1. **Two separate render trees, not one CSS-toggled tree.** `< lg`: a plain `<div>` that shows exactly one of {chat content, preview content} based on `mobileSurface` state — no `ResizablePanelGroup`, no `ResizablePanel`, no `ResizableHandle`, no drag handle, no percentage sizing. `>= lg`: the existing `ResizablePanelGroup` untouched (this is out of scope — desktop resizing already works and is not broken).
2. **Content is defined once, rendered twice — via JSX variables, not a shared sub-component.** The chat panel content (header, scroll body, composer) and the preview panel content (`WorkspaceTopBar` + preview/code panel) are large, stateful, tightly-coupled JSX blocks that already close over ~40 pieces of local state in `WorkspaceShell`. Extracting them into separate components would mean threading all of that state through props — a bigger, riskier refactor than this fix calls for. Instead: assign the JSX to two `const` variables (`chatPanelContent`, `previewPanelContent`) once per render, then reference the same variable in both the mobile `<div>` tree and the desktop `<ResizablePanelGroup>` tree. Zero behavior duplication, zero prop-threading.
3. **Breakpoint stays `lg` (1024px), not `md` (768px).** This deviates from the site-wide `MobileNav` foundation (`md:hidden`), which is a deliberate, pre-existing choice (see prior spec) — two dense content panels side-by-side need more room than a simple nav bar. Not changing this in this pass.
4. **Kebab wiring:** a new local `isMobileMenuOpen` boolean state in `WorkspaceShell` (or lifted into `WorkspaceTopBar` if it doesn't need to reach outside the top bar — confirmed below it doesn't). Tapping the kebab opens the existing `MobileSheet` primitive (`src/components/ui/mobile-sheet.tsx`, already shipped by the 2026-07-25 foundation spec) containing: viewport picker (Komputer/HP), annotation toggle (Ubah, only when `annotationAvailable && activeTab === "preview"`), Support link, History button, Energy Ledger button, Runtime control. This is exactly the existing "Desktop cluster" block (`WorkspacePrimitives.tsx:178-241`) plus the annotation button (`:151-164`) — same JSX, rendered inside the sheet instead of being permanently `hidden` on mobile.
5. **No new dependencies.** `MobileSheet` already wraps Radix Dialog + Framer Motion, both already installed.
6. **`openChatPanel`/`openPreviewPanel`/`closeChatPanel`/`closePreviewPanel` stay unchanged.** They already set `mobileSurface` state first (the thing that drives the new mobile tree) and only *then* call `.resize()` on the RRP panel refs — which is guarded by optional chaining (`?.resize`) and simply no-ops when the refs are `null` (i.e., when the desktop tree isn't mounted). No coupling risk confirmed by reading the current implementation.

## Architecture

### A. Extract JSX into two variables (`WorkspaceShell.tsx`)

Immediately before the `return (...)` in `WorkspaceShell`, assign:

```tsx
const chatPanelContent = (
  <aside className={chatPanelClass}>
    {/* existing header block: Dashboard link, title/rename, EnergyDisplay, desktop panel-toggle button */}
    {/* existing scroll body: ChatMessages, BuildProgressPanel, error/retry states, scroll-to-bottom button */}
    {/* existing composer: AnimatePresence with all composerState branches */}
  </aside>
);

const previewPanelContent = (
  <section className={previewPanelClass}>
    <div className="flex h-full min-h-0 flex-col bg-[#10100f] text-surface-warm-white">
      <WorkspaceTopBar
        {/* existing props, plus new isMobileMenuOpen/setIsMobileMenuOpen */}
      />
      <div className="min-h-0 flex-1 overflow-hidden bg-[#10100f]">
        {/* existing activeTab === "preview" / "code" branches */}
      </div>
    </div>
  </section>
);
```

This is a pure extraction — the JSX inside each variable is copied verbatim from the current `ResizablePanel` children, not rewritten. No behavior change from this step alone.

### B. Two render paths

```tsx
return (
  <div className="flex h-dvh flex-col overflow-hidden bg-[#10100f] text-surface-warm-white" onTouchEnd={handleTouchEnd} onTouchStart={handleTouchStart}>
    <nav aria-label="Pilih tampilan ruang kerja" className="... lg:hidden">
      {/* existing Diskusi/Tampilan/Kode bottom-nav buttons, unchanged */}
    </nav>

    {/* Mobile/tablet: one full-screen surface, no resizable split */}
    <div className="min-h-0 flex-1 overflow-hidden lg:hidden">
      {mobileSurface === "chat" ? chatPanelContent : null}
      {mobileSurface === "preview" && showPreviewPanel ? previewPanelContent : null}
    </div>

    {/* Desktop: resizable split, untouched from before this spec */}
    <ResizablePanelGroup orientation="horizontal" className="hidden min-h-0 flex-1 overflow-hidden lg:flex">
      <ResizablePanel id="chat" panelRef={chatPanelRef} defaultSize={showPreviewPanel ? "25%" : "100%"} minSize="20%" collapsible collapsedSize={0}>
        {chatPanelContent}
      </ResizablePanel>
      {showPreviewPanel ? (
        <>
          <ResizableHandle withHandle className="bg-surface-warm-white/8 transition-colors hover:bg-surface-warm-white/16" />
          <ResizablePanel id="preview" panelRef={previewPanelRef} defaultSize="75%" minSize="8%" collapsible collapsedSize={0}>
            {previewPanelContent}
          </ResizablePanel>
        </>
      ) : null}
    </ResizablePanelGroup>

    {annotations.length ? <VisualFeedbackWidget ... /> : null}
  </div>
);
```

Key points:
- The `hidden ... lg:flex` / `... lg:hidden` pair on the two top-level wrappers is a plain visibility toggle on two **independent** subtrees — no shared `ResizablePanelGroup` instance is asked to behave two different ways. Each tree mounts/unmounts its own DOM.
- On `>= lg`, `ResizablePanel` no longer needs the `className` prop gymnastics (`max-lg:hidden`, `max-lg:!flex-1`) from the previous attempt — those were compensating for the broken shared-tree approach and go away entirely. `ResizablePanel` reverts to exactly its pre-mobile-pass form (this is a **deletion**, not new complexity).
- `ResizableHandle` needs no responsive classes either — it only exists inside the `lg:flex` tree now.
- **React will mount two copies of `chatPanelContent`'s underlying component tree** (one in each conditional branch) only in the sense that the JSX is referenced twice, but only one branch is ever rendered at a time per breakpoint — `hidden` on the outer wrapper does NOT unmount children in React (CSS `display:none` only), so at `>= lg` the mobile tree's `<div className="... lg:hidden">` still mounts `chatPanelContent`/`previewPanelContent` in the DOM (just hidden), while the desktop tree also mounts them. **This is the one real risk of this approach and is called out below.**

### C. Risk: double-mounting content at each breakpoint

Because both the mobile `<div>` and the desktop `<ResizablePanelGroup>` are unconditionally in the JSX tree (visibility controlled by `hidden lg:flex` / `lg:hidden` classes, not by conditional rendering), **both trees mount simultaneously** — the `GeneratedPreviewFrame` iframe, the chat scroll listeners, and any local state inside the extracted JSX would exist twice at any viewport width. This is unacceptable: two iframes double the preview build's resource usage, two chat scroll containers double the scroll-position tracking, etc.

**Mitigation (locked decision):** gate each tree with a real conditional, not just CSS visibility. Add a single `useMediaQuery`-style check — but per DEV.md/AGENTS.md "prefer platform features," avoid a JS media-query hook if a CSS-only approach can still work. Resolution: keep the CSS-only `hidden`/`lg:flex` approach **only for the outer shell classes**, but conditionally render (`{isDesktop ? <ResizablePanelGroup>...</ResizablePanelGroup> : <div>...</div>}`) using a single boolean derived from a `matchMedia` listener already needed elsewhere — **confirm during implementation whether such a hook already exists in the codebase (grep for `matchMedia`/`useMediaQuery` first); if not, add one minimal hook** (`src/lib/use-media-query.ts`, SSR-safe default to `false`/mobile-first, listens to `(min-width: 1024px)`). This avoids double-mounting the iframe and scroll listeners at the cost of one small new hook — smaller and more correct than accepting double-mount, and smaller than threading two full sets of refs/effects through a shared component.

This changes decision #1 from "two CSS-toggled trees" to **"one conditionally-rendered tree, chosen by a `useIsDesktopViewport()` hook"** — the JSX-variable extraction (item A) stays identical either way; only the outer `return` wiring differs from the naive CSS-only sketch in item B above use `{isDesktop ? (...) : (...)}` instead of two permanently-mounted `hidden`-toggled siblings.

### D. Kebab menu wiring

`WorkspacePrimitives.tsx`:

```tsx
export function WorkspaceTopBar({
  // ...existing props
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="...">
      {/* existing desktop-only left cluster, unchanged */}

      <div className="flex min-w-0 w-full items-center justify-end gap-spacing-2 sm:hidden">
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
      </div>

      {/* existing desktop cluster, unchanged, still hidden on mobile via sm:flex */}
      <div className="hidden ... sm:flex ...">
        {/* Support / History / Energy / Runtime / viewport picker */}
      </div>

      <MobileSheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen} title="Menu">
        <div className="flex flex-col gap-spacing-3">
          {annotationAvailable && activeTab === "preview" ? (
            <button type="button" onClick={() => { onToggleAnnotation?.(); setIsMobileMenuOpen(false); }} className="...">
              <MessageSquarePlus className="size-4" />
              {annotationActive ? "Ubah aktif" : "Ubah"}
            </button>
          ) : null}
          {activeTab === "preview" ? (
            <div role="tablist" aria-label="Tampilan viewport" className="...">
              {/* Komputer / HP TabButtons, same as desktop cluster */}
            </div>
          ) : null}
          {projectId ? <a href="/support" ...>Hubungi Dukungan</a> : null}
          {projectId ? <WorkspaceHistoryButton projectId={projectId} /> : null}
          {projectId ? <EnergyLedgerButton projectId={projectId} /> : null}
          {runtime ? <RuntimeControl runtime={runtime} /> : null}
        </div>
      </MobileSheet>
    </div>
  );
}
```

State stays local to `WorkspaceTopBar` — nothing outside the component needs to know whether the mobile menu sheet is open, so it does not need to be lifted to `WorkspaceShell`. Confirmed by reading current prop usage: no other consumer of `WorkspaceTopBar`'s output reads a "menu open" flag.

The sheet's contents are the **same JSX** as the existing desktop cluster (viewport picker, Support, History, Energy, Runtime) plus the annotation button — copied into the sheet body, not deleted from the desktop cluster (desktop keeps its always-visible row; only mobile routes these controls through the sheet instead of `hidden`).

## Data flow

No data/API changes. Pure UI structure + one new local boolean (`isMobileMenuOpen`) + one new small hook (`useIsDesktopViewport`, if not already present).

## Error handling

N/A — no new failure modes. The `MobileSheet` primitive already handles its own open/close/dismiss lifecycle (confirmed by reading `src/components/ui/mobile-sheet.tsx`: Radix Dialog handles Escape/overlay-click/focus-trap; the drag-to-dismiss threshold is already implemented).

## Testing (TDD-lite)

1. **Unit — `useIsDesktopViewport` hook (if newly added):** mock `window.matchMedia`, assert the hook returns `false` before mount (SSR-safe default) and reflects the media query's `matches` value after mount, and updates on a simulated `change` event.
2. **Unit — single-tree mount assertion:** render `WorkspaceShell` (or a minimal harness around the extracted conditional) with the desktop-viewport mock forced `true`, assert the `ResizablePanelGroup` tree is present and the mobile `<nav>`/plain-div tree is absent from the render tree (not just CSS-hidden) — and vice versa with the mock forced `false`. This is the regression test for the root cause: it fails loudly if a future change reintroduces the double-mount.
3. **Unit — kebab opens sheet:** render `WorkspaceTopBar`, click the "Buka menu" button, assert a `role="dialog"` appears (Radix Dialog's role) containing the viewport picker and Support link.
4. **Unit — kebab item triggers correct handler:** click "Ubah" inside the opened sheet, assert `onToggleAnnotation` was called and the sheet closes (`isMobileMenuOpen` returns to `false` — assert via the dialog disappearing).
5. **Visual — Playwright device capture (reuse the existing `tests/mobile/device-capture.test.ts` tier-2 pattern):** at 390/430/768/1024px, assert no horizontal overflow and that exactly one of {chat, preview} content is visible at `< 1024`, both/split visible at `>= 1024`. This requires a live dev server per the existing tier-2 test's `MOBILE_AUDIT_URL` gate — same deferred-until-live-server caveat as the previous mobile spec's Task 7.

## Out of scope

- Any change to desktop (`>= lg`) resizable behavior — it already works; this spec only stops it from also (mis-)running on mobile.
- Changing the `lg` breakpoint choice (already justified in the prior spec, reaffirmed here).
- Redesigning what's inside the kebab sheet beyond moving the existing desktop-cluster JSX into it — no new controls, no new copy.
- Touching `CodeView`, chat bubble CSS, composer, or the swipe gesture — all already fixed in the prior spec and unaffected by this one.
- A generic `useMediaQuery` utility library — if a minimal hook is needed, it is scoped to exactly this one query (`(min-width: 1024px)`), not a general-purpose abstraction.

## Open questions for implementation

- Confirm no existing `matchMedia`/`useMediaQuery` hook exists in the codebase before adding one (grep first — `AGENTS.md`: "search and reuse first").
- Confirm whether `WorkspaceHistoryButton`/`EnergyLedgerButton`/`RuntimeControl` render correctly at the sheet's typical width (`max-h-[85dvh]`, full viewport width) — they were designed for a `h-9` inline top-bar slot; verify they don't need size-prop adjustments when placed in a stacked sheet column. If they need a size variant, add the minimal prop, not a new component.
- Confirm the `annotationAvailable && activeTab === "preview"` gate for showing "Ubah" inside the sheet still makes sense when the sheet can be opened from the Kode tab too (i.e., should "Ubah" simply not appear when on Kode, same as today's desktop behavior) — current design says yes, matching existing desktop logic exactly.

## Risks

- **The `useIsDesktopViewport` hook introduces a client/server render mismatch risk** (SSR renders the `false`/mobile branch, client may immediately flip to `true` on a desktop browser, causing a one-frame layout shift). Mitigation: this is the same class of risk the existing `viewport` state (`"desktop" | "mobile"` for the iframe preview toggle) and `clientOnly()` wrapper (already used for `MonacoEditor` in this same file) already manage in this codebase — follow the same pattern (mount-effect-gated hook, default false, useEffect sets the real value) rather than inventing a new one.
- **Regression on desktop resizing.** Because `ResizablePanel`/`ResizableHandle` revert to their pre-mobile-pass form, verify manually (or via the existing desktop-focused tests, if any) that drag-resize, collapse/expand, and `chatPanelRef`/`previewPanelRef` imperative calls still work exactly as before this spec's predecessor — this spec is a pure regression risk on desktop precisely because it deletes code, not because it adds anything new to that path.