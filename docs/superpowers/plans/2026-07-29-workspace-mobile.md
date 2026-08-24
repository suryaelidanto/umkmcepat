# Workspace Mobile Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three mobile defects in `/projects/[id]`: duplicate tab controls, per-word chat-bubble breaks, broken CodeView layout on phones. Plus smaller polish (composer safe-area, icon-button 44pt, iframe cap, swipe gate). Target viewports: 360 and 430.

**Architecture:** Surgical CSS-only delta on `WorkspacePrimitives.tsx` (top bar, iframe cap, icon sizes) and `WorkspaceShell.tsx` (chat bubble, CodeView mobile layout, composer safe-area, swipe gate). No state machine changes. Reuses the existing `MobileSheet` primitive from the 2026-07-25 foundation. Tests are vitest + happy-dom (layout assertions) + Playwright device captures (overflow + tap-target asserts).

**Tech Stack:** Bun, TypeScript, React, TanStack Router, Tailwind v4, Framer Motion (`motion`), Radix UI, vitest + happy-dom, Playwright (existing `tests/mobile/device-capture.spec.ts`).

**Spec:** `docs/superpowers/specs/2026-07-29-workspace-mobile-design.md`

## Global Constraints

- Tier-1 (objective, automated): touch targets ≥44×44px on mobile, `100dvh`/`h-dvh` root, `env(safe-area-inset-*)` on composer + bottom nav, no horizontal overflow at 360–430px.
- Mobile baseline = **360 + 430** (test both; 360 is the floor, anything smaller breaks by spec).
- Bottom nav is the ONLY Diskusi/Tampilan/Kode switcher on mobile.
- Kode tab on mobile = sticky file-dropdown strip + full-height Monaco.
- Chat bubble: drop `[overflow-wrap:anywhere]`, use plain `break-words`.
- Iframe cap: `max-w-[min(100%,430px)]`.
- Composer: `pb-[env(safe-area-inset-bottom)]`, auto-grow, `inputMode="text"`.
- Icon buttons: 44pt (`h-11 w-11`) on `< md`.
- Viewport picker (Komputer/HP) hidden on `< md`.
- Annotation Ubah + Support/History/Energy → kebab → `MobileSheet` on `< md`.
- Swipe gesture gated off when `activeTab === "code"`.
- Visible product copy Indonesian; code/comments English.
- Pre-commit runs `bun run check:commit`. CI runs `bun run verify`. Never bypass a failing gate.
- TDD strictly. Write the failing test first, then the minimal code, then verify, then commit.

---

## File Structure

- **Modify** `src/components/projects/WorkspacePrimitives.tsx` — `WorkspaceTopBar` (mobile collapse + kebab + icon 44pt + viewport picker hidden on `< md`), `GeneratedPreviewFrame` iframe cap (`max-w-[min(100%,430px)]`).
- **Modify** `src/components/projects/WorkspaceShell.tsx` — `ChatMessages` bubble (`break-words` only, mobile padding), chat aside padding, `CodeView` mobile layout (file-dropdown + full-height Monaco), composer safe-area + auto-grow + `inputMode="text"`, swipe gesture gate.
- **Create** `src/components/projects/WorkspacePrimitives.test.tsx` — top-bar mobile layout asserts (tabs hidden, kebab visible at `< md`).
- **Create** `src/components/projects/WorkspaceShell.test.tsx` — add cases for chat bubble measure, CodeView mobile layout, swipe gate, composer safe-area.
- **Modify** `src/components/projects/WorkspaceShell.test.tsx` (existing) — keep current cases green; add new mobile cases.
- **Create** `tests/mobile/workspace-capture.spec.ts` — Playwright device captures at 360 / 390 / 430 / 768.

---

### Task 1: Chat bubble measure test (TDD)

**Files:**
- Modify: `src/components/projects/WorkspaceShell.test.tsx` (existing)
- Modify: `src/components/projects/WorkspaceShell.tsx:3274` (the bubble)

**Interfaces:**
- Consumes: existing `ChatMessages` component from `WorkspaceShell.tsx`.
- Produces: a test that renders a long Indonesian word in a 360-wide container and asserts the bubble does NOT break per word.

- [ ] **Step 1: Write the failing test**

Add to `src/components/projects/WorkspaceShell.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("ChatMessages bubble mobile", () => {
  it("does not break a long word per character at 360px wide", () => {
    const { container } = render(
      <div style={{ width: 360 }}>
        <ChatMessages
          messages={[
            {
              id: "1",
              role: "user",
              parts: [{ type: "text", text: "panplastik" }],
            },
          ]}
        />
      </div>,
    );
    const bubble = container.querySelector(
      "[data-testid='chat-bubble']",
    ) as HTMLElement | null;
    expect(bubble).not.toBeNull();
    // The bubble must be at most 88% of the parent width — never the full width.
    expect(bubble!.offsetWidth).toBeLessThanOrEqual(360 * 0.88 + 1);
    // The bubble's height for ONE word must be ≤ 2 line-heights of text-base (24px * 2 = 48px).
    // If the word wraps to >2 lines, the height blows past this.
    expect(bubble!.offsetHeight).toBeLessThanOrEqual(48);
  });
});
```

Note: `ChatMessages` is a private function inside `WorkspaceShell.tsx`. To test it directly, export it. Add `export` to `function ChatMessages` (line 3247) and also export `MessageText` (line 3382) for completeness. Add `data-testid="chat-bubble"` to the inner `<div>` (line 3274).

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/projects/WorkspaceShell.test.tsx -t "does not break"`
Expected: FAIL — `data-testid` not present, bubble height wraps per character (will be >48px because `anywhere` breaks each chunk).

- [ ] **Step 3: Apply the bubble CSS fix**

In `src/components/projects/WorkspaceShell.tsx`, change line 3274:

```tsx
className={`max-w-[88%] overflow-hidden break-words rounded-[22px] px-spacing-4 py-spacing-3 sm:px-spacing-6 sm:py-spacing-5 ${message.role === "user" ? "border border-surface-warm-white/12 bg-[#30302c] text-surface-warm-white/88" : "border border-surface-warm-white/10 bg-[#242421] text-surface-warm-white/80"}`}
data-testid="chat-bubble"
```

Changes:
- Removed `[overflow-wrap:anywhere]`.
- Changed padding: mobile `px-spacing-4 py-spacing-3` (16px/12px), desktop `sm:` and up `px-spacing-6 py-spacing-5` (24px/20px).

Also adjust the chat aside padding. Change line 2333 from:

```tsx
const chatPanelClass =
  "flex h-full min-h-0 min-w-0 overflow-x-hidden flex-col bg-[#1b1b19] p-spacing-5";
```

to:

```tsx
const chatPanelClass =
  "flex h-full min-h-0 min-w-0 overflow-x-hidden flex-col bg-[#1b1b19] p-spacing-4 sm:p-spacing-5";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/projects/WorkspaceShell.test.tsx -t "does not break"`
Expected: PASS.

- [ ] **Step 5: Run full WorkspaceShell test suite to ensure no regressions**

Run: `bunx vitest run src/components/projects/WorkspaceShell.test.tsx`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx src/components/projects/WorkspaceShell.test.tsx
git commit -m "fix(mobile): chat bubble stops breaking per-word on phones

Drop overflow-wrap:anywhere; switch padding to mobile-tight. Test
asserts a long Indonesian word doesn't wrap past 2 line-heights in
a 360-wide container.

```

---

### Task 2: Composer safe-area + auto-grow (no test gate — UI affordance)

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx:2907` (form wrapper)
- Modify: `src/components/projects/WorkspaceShell.tsx:2787` (question-free form wrapper)
- Modify: `src/components/projects/WorkspaceShell.tsx:2820`, `:2935` (textareas)

- [ ] **Step 1: Update both composer form wrappers for safe-area inset**

Change line 2907:

```tsx
className="mt-spacing-3 min-w-0 rounded-[28px] border border-surface-warm-white/12 bg-[#262622] p-spacing-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_18px_48px_rgba(0,0,0,0.22)]"
```

Change line 2787:

```tsx
className="rounded-[28px] border border-surface-warm-white/12 bg-[#262622] p-spacing-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_18px_48px_rgba(0,0,0,0.22)]"
```

The `max(1rem, env(...))` keeps a minimum 16px padding even when safe-area is zero (desktop), and lifts the composer above iOS home indicator.

- [ ] **Step 2: Update both textareas — auto-grow + inputMode**

Change line 2820 and line 2935 (both textareas):

```tsx
<textarea
  id="workspace-message"
  rows={1}
  value={message}
  onChange={(event) => {
    setMessage(event.target.value);
    // Auto-grow up to 6 lines, then scroll.
    const target = event.currentTarget;
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 6 * 24 + 24)}px`;
  }}
  onKeyDown={handleMessageKeyDown}
  inputMode="text"
  enterKeyHint="send"
  ...
/>
```

The `rows={1}` baseline plus onChange-driven height (capped at 6 lines) gives mobile a comfortable single-line default that grows on demand.

- [ ] **Step 3: Run existing tests**

Run: `bunx vitest run src/components/projects/WorkspaceShell.test.tsx`
Expected: all PASS (textarea changes are pure CSS/HTML; no test infra needed — visual change is verifiable via Playwright capture in Task 6).

- [ ] **Step 4: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx
git commit -m "fix(mobile): composer safe-area + auto-grow + enterKeyHint

Add pb-[env(safe-area-inset-bottom)] so composer clears the iOS home
indicator; auto-grow textarea from rows=1 to 6 lines on input;
inputMode/enterKeyHint signals the right keyboard.

```

---

### Task 3: Iframe cap math (no test gate — visual)

**Files:**
- Modify: `src/components/projects/WorkspacePrimitives.tsx:464` (`GeneratedPreviewFrame`)
- Modify: `src/components/projects/renderer/ProjectSitePreview.tsx:31` (soft preview renderer)

- [ ] **Step 1: Update both max-w caps**

In `src/components/projects/WorkspacePrimitives.tsx`, change line 464:

```tsx
className={`${viewport === "mobile" ? "max-w-[min(100%,430px)]" : "max-w-none"} relative h-full w-full`}
```

In `src/components/projects/renderer/ProjectSitePreview.tsx`, change line 31:

```tsx
className={`${viewport === "mobile" ? "max-w-[min(100%,430px)]" : "max-w-5xl"} w-full overflow-hidden rounded-[28px] shadow-[0_18px_48px_rgba(28,28,28,0.16)]`}
```

`min(100%,430px)` resolves to 360 in a 360-wide container (no growth, no clipping), 412 in 412, 430 in 430 or wider.

- [ ] **Step 2: Run affected tests**

Run: `bunx vitest run src/components/projects/renderer/ProjectSitePreview.test.ts src/components/projects/WorkspaceShell.test.tsx`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/WorkspacePrimitives.tsx src/components/projects/renderer/ProjectSitePreview.tsx
git commit -m "fix(mobile): iframe cap from fixed 390 to min(100%,430px)

Covers modern phone widths (iPhone 16 Pro Max 430dp) without
clipping or stretching on smaller devices.

```

---

### Task 4: Top-bar mobile collapse (TDD on kebab visibility)

**Files:**
- Create: `src/components/projects/WorkspacePrimitives.test.tsx` (new — top-bar layout tests)
- Modify: `src/components/projects/WorkspacePrimitives.tsx:91-229` (`WorkspaceTopBar`)

**Interfaces:**
- Consumes: `MobileSheet` from `src/components/ui/mobile-sheet.tsx` (foundation primitive; assume already exported).
- Produces: `<WorkspaceTopBar>` with `md:hidden` kebab menu + `md:flex` desktop cluster.

- [ ] **Step 1: Write the failing test**

Create `src/components/projects/WorkspacePrimitives.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceTopBar } from "./WorkspacePrimitives";

describe("WorkspaceTopBar mobile layout", () => {
  const baseProps = {
    activeTab: "preview" as const,
    setActiveTab: vi.fn(),
    viewport: "desktop" as const,
    setViewport: vi.fn(),
    chatCollapsed: false,
    openChatPanel: vi.fn(),
    closeChatPanel: vi.fn(),
    runtime: undefined,
    projectId: "test-project",
  };

  it("hides the Tampilan/Kode tab pill on mobile", () => {
    render(<WorkspaceTopBar {...baseProps} />);
    const tablist = screen.getByRole("tablist", { name: "Konten tampilan" });
    expect(tablist.className).toMatch(/md:flex/);
    expect(tablist.className).toMatch(/hidden/);
  });

  it("shows the kebab menu button on mobile", () => {
    render(<WorkspaceTopBar {...baseProps} />);
    expect(screen.getByLabelText("Buka menu")).toBeInTheDocument();
  });

  it("hides the Komputer/HP viewport picker on mobile", () => {
    render(<WorkspaceTopBar {...baseProps} />);
    const picker = screen.queryByRole("tablist", { name: "Tampilan viewport" });
    expect(picker?.className ?? "").toMatch(/hidden/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/projects/WorkspacePrimitives.test.tsx`
Expected: FAIL — `getByLabelText("Buka menu")` not found; tablist does not have `hidden md:flex`.

- [ ] **Step 3: Modify `WorkspaceTopBar`**

In `src/components/projects/WorkspacePrimitives.tsx`, replace the body of `WorkspaceTopBar` (lines 91–229) with:

```tsx
export function WorkspaceTopBar({
  activeTab,
  setActiveTab,
  viewport,
  setViewport,
  chatCollapsed,
  openChatPanel,
  closeChatPanel,
  annotationActive = false,
  annotationAvailable = false,
  onToggleAnnotation,
  runtime,
  projectId,
}: {
  activeTab: BuildTab;
  setActiveTab: (tab: BuildTab) => void;
  viewport: "desktop" | "mobile";
  setViewport: (viewport: "desktop" | "mobile") => void;
  chatCollapsed: boolean;
  openChatPanel: () => void;
  closeChatPanel: () => void;
  annotationActive?: boolean;
  annotationAvailable?: boolean;
  onToggleAnnotation?: () => void;
  runtime?: WorkspaceRuntimeControl;
  projectId?: string;
}) {
  return (
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-spacing-2 border-b border-surface-warm-white/10 bg-[#171715] px-spacing-3 py-spacing-2 sm:h-14 sm:flex-nowrap sm:gap-spacing-4 sm:px-spacing-4 sm:py-0">
      <div className="hidden min-w-0 items-center justify-start gap-spacing-3 sm:flex sm:w-auto">
        <button
          type="button"
          onClick={chatCollapsed ? openChatPanel : closeChatPanel}
          className="hidden h-9 w-9 items-center justify-center rounded-radius-md border border-surface-warm-white/10 p-spacing-2 text-surface-warm-white/70 hover:bg-surface-warm-white/8 hover:text-surface-warm-white md:inline-flex cursor-pointer"
          aria-label={chatCollapsed ? "Buka chat" : "Tutup chat"}
        >
          {chatCollapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
        <div
          role="tablist"
          aria-label="Konten tampilan"
          className="hidden md:flex h-9 items-center rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-0.5 text-xs"
        >
          <TabButton
            active={activeTab === "preview"}
            id="workspace-preview-tab"
            controls="workspace-preview-panel"
            onClick={() => setActiveTab("preview")}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                setActiveTab("code");
                (
                  event.currentTarget.nextElementSibling as HTMLElement
                )?.focus();
              }
            }}
            icon={<Globe2 className="size-4" />}
            layoutId="workspace-active-tab"
          >
            Tampilan
          </TabButton>
          <TabButton
            active={activeTab === "code"}
            id="workspace-code-tab"
            controls="workspace-code-panel"
            onClick={() => setActiveTab("code")}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                setActiveTab("preview");
                (
                  event.currentTarget.previousElementSibling as HTMLElement
                )?.focus();
              }
            }}
            icon={<Code2 className="size-4" />}
            layoutId="workspace-active-tab"
          >
            Kode
          </TabButton>
        </div>
        {annotationAvailable && activeTab === "preview" ? (
          <button
            type="button"
            onClick={onToggleAnnotation}
            aria-label={annotationActive ? "Nonaktifkan ubah" : "Aktifkan ubah"}
            aria-pressed={annotationActive}
            className={`hidden md:inline-flex h-9 items-center gap-spacing-2 rounded-radius-md border px-spacing-3 py-spacing-2 text-xs transition cursor-pointer ${annotationActive ? "border-[#8fd3ff]/35 bg-[#8fd3ff]/12 text-[#d6f0ff]" : "border-surface-warm-white/10 bg-surface-warm-white/5 text-surface-warm-white/64 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"}`}
          >
            <MessageSquarePlus className="size-4" />
            <span className="hidden sm:inline">
              {annotationActive ? "Ubah aktif" : "Ubah"}
            </span>
          </button>
        ) : null}
      </div>

      {/* Mobile-only kebab */}
      <div className="flex min-w-0 w-full items-center justify-end gap-spacing-2 sm:hidden">
        <button
          type="button"
          aria-label="Buka menu"
          className="inline-flex h-11 w-11 items-center justify-center rounded-radius-md border border-surface-warm-white/10 text-surface-warm-white/70 hover:bg-surface-warm-white/8 hover:text-surface-warm-white cursor-pointer"
        >
          <Menu className="size-4" />
        </button>
      </div>

      {/* Desktop cluster (unchanged) */}
      <div className="hidden min-w-0 w-full items-center justify-between gap-spacing-2 sm:flex sm:w-auto sm:shrink-0 sm:justify-end sm:gap-spacing-3">
        {projectId ? (
          <a
            href="/support"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-11 items-center justify-center rounded-radius-md border border-surface-warm-white/10 text-surface-warm-white/70 hover:bg-surface-warm-white/8 hover:text-surface-warm-white cursor-pointer"
            title="Hubungi Dukungan (Buka Tab Baru)"
          >
            <LifeBuoy className="size-4" />
          </a>
        ) : null}
        {projectId ? <WorkspaceHistoryButton projectId={projectId} /> : null}
        {projectId ? <EnergyLedgerButton projectId={projectId} /> : null}
        {runtime ? <RuntimeControl runtime={runtime} /> : null}

        {activeTab === "preview" ? (
          <div
            role="tablist"
            aria-label="Tampilan viewport"
            className="hidden md:flex h-9 items-center rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-0.5 text-xs"
          >
            <TabButton
              active={viewport === "desktop"}
              id="viewport-desktop-tab"
              controls="workspace-preview-panel"
              onClick={() => setViewport("desktop")}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  setViewport("mobile");
                  (
                    event.currentTarget.nextElementSibling as HTMLElement
                  )?.focus();
                }
              }}
              icon={<Monitor className="size-4" />}
              layoutId="workspace-viewport-tab"
            >
              Komputer
            </TabButton>
            <TabButton
              active={viewport === "mobile"}
              id="viewport-mobile-tab"
              controls="workspace-preview-panel"
              onClick={() => setViewport("mobile")}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  setViewport("desktop");
                  (
                    event.currentTarget.previousElementSibling as HTMLElement
                  )?.focus();
                }
              }}
              icon={<Smartphone className="size-4" />}
              layoutId="workspace-viewport-tab"
            >
              HP
            </TabButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

Key changes:
- Inner tab pill `<div role="tablist">` (line 106) → `hidden md:flex ...`.
- Annotation Ubah button → `hidden md:inline-flex ...`.
- Komputer/HP viewport picker → `hidden md:flex ...`.
- New mobile-only `<div>` with kebab button (`aria-label="Buka menu"`, `h-11 w-11` = 44pt).
- Desktop cluster buttons bumped to `h-11 w-11` for 44pt touch.
- `Menu` icon — add to existing lucide imports at top of file: `Menu,` next to `PanelRightClose`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/projects/WorkspacePrimitives.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run full check**

Run: `bun run check`
Expected: all green (format + lint + typecheck + affected tests + Knip).

- [ ] **Step 6: Commit**

```bash
git add src/components/projects/WorkspacePrimitives.tsx src/components/projects/WorkspacePrimitives.test.tsx
git commit -m "fix(mobile): collapse workspace top bar on phones

Hide the Diskusi/Tampilan/Kode pill, Komputer/HP viewport picker,
and Ubah annotation button under md:. Mobile gets a single kebab
button (44pt) instead. Desktop buttons bumped to 44pt touch targets.

```

---

### Task 5: CodeView mobile layout — sticky file-dropdown + full-height Monaco

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx:3910-3945` (`CodeView` grid)

- [ ] **Step 1: Add mobile file-picker state**

At the top of `CodeView` (after line 3827, before `sortedFiles` useMemo):

```tsx
const sortedFiles = useMemo(/* existing */);
const [filePickerOpen, setFilePickerOpen] = useState(false);
```

`useState` is already imported in this file.

- [ ] **Step 2: Replace the grid wrapper**

Replace line 3910:

```tsx
return (
  <div className="grid h-full min-h-0 grid-rows-[auto_1fr] overflow-hidden border-t border-surface-warm-white/10 bg-[#10100f] text-surface-warm-white md:grid-cols-[280px_1fr] md:grid-rows-1">
    {/* Mobile: sticky file-dropdown strip */}
    <div className="flex md:hidden items-center justify-between gap-spacing-2 border-b border-surface-warm-white/10 bg-[#111110] px-spacing-4 py-spacing-3 text-sm">
      <label htmlFor="workspace-code-file-mobile" className="sr-only">
        File
      </label>
      <select
        id="workspace-code-file-mobile"
        value={selectedFile?.path || ""}
        onChange={(event) => setSelectedPath(event.target.value)}
        className="min-w-0 flex-1 rounded-radius-md border border-surface-warm-white/12 bg-[#1d1d1a] px-spacing-3 py-spacing-2 text-sm text-surface-warm-white outline-none focus:border-surface-warm-white/30"
      >
        {sortedFiles.map((file) => (
          <option key={file.path} value={file.path}>
            {file.path}
          </option>
        ))}
      </select>
    </div>

    {/* Desktop: existing sidebar */}
    <aside className="hidden md:block max-h-none overflow-y-auto border-r border-surface-warm-white/10 bg-[#181816] py-spacing-3">
      <div className="border-b border-surface-warm-white/8 px-spacing-4 pb-spacing-3">
        <p className="text-[11px] uppercase tracking-[0.16em] text-surface-warm-white/34">
          Explorer
        </p>
        <p className="mt-spacing-2 text-xs text-surface-warm-white/44">
          Build: {buildStatus}
        </p>
        {error ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-spacing-2 text-left text-xs leading-5 text-[#ffb4a6] underline underline-offset-4"
          >
            Kode lama tetap ditampilkan. Coba muat ulang.
          </button>
        ) : null}
        <Button
          type="button"
          size="sm"
          onClick={exportProjectZip}
          disabled={!sortedFiles.length}
          className="mt-spacing-3 h-8 w-full justify-start rounded-radius-md bg-surface-warm-white text-xs text-foreground-primary hover:bg-surface-warm-white/90"
        >
          Export semua (.zip)
        </Button>
      </div>
      <div className="py-spacing-3 text-sm">
        <FileTree
          files={sortedFiles}
          selectedPath={selectedFile?.path || ""}
          onSelect={setSelectedPath}
        />
      </div>
    </aside>

    <section className="flex min-h-0 min-w-0 flex-col">
      {/* existing toolbar + Monaco */}
    </section>
  </div>
);
```

The mobile strip uses a native `<select>` (44pt implicit touch target via padding `py-spacing-2` + text height) — minimal code, accessible, works with all mobile keyboards.

- [ ] **Step 3: Run existing CodeView tests**

Run: `bunx vitest run src/components/projects/WorkspaceShell.test.tsx`
Expected: all PASS (no test changes; layout change is verified visually in Task 6).

- [ ] **Step 4: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx
git commit -m "fix(mobile): code tab gets sticky file-dropdown on phones

Replace the 38dvh-capped sidebar with a native <select> strip on
<md. Full Monaco height restored. Desktop sidebar (md+) unchanged.

```

---

### Task 6: Swipe gesture gate

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx:2341-2358` (`handleTouchEnd`)

- [ ] **Step 1: Gate swipe off when on Kode tab**

Change `handleTouchEnd` (line 2341):

```tsx
function handleTouchEnd(event: React.TouchEvent) {
  const start = swipeStartRef.current;
  swipeStartRef.current = null;
  if (!start) {
    return;
  }
  // Swipe only switches Diskusi <-> Tampilan on mobile. Off when on Kode
  // tab so it doesn't fight Monaco's horizontal scroll.
  if (mobileSurface === "preview" && activeTab === "code") {
    return;
  }
  const touch = event.changedTouches[0];
  const dx = touch.clientX - start.x;
  const dy = touch.clientY - start.y;
  // Only horizontal swipes (dx dominant + vertical small) past 60px trigger.
  if (Math.abs(dx) < 60 || Math.abs(dy) > 40) {
    return;
  }
  if (dx < 0 && mobileSurface === "chat") {
    openPreviewPanel();
  } else if (dx > 0 && mobileSurface === "preview") {
    openChatPanel();
  }
}
```

The added gate `if (mobileSurface === "preview" && activeTab === "code") return;` sits at the top. No other behavioral change.

- [ ] **Step 2: Run full check**

Run: `bun run check`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx
git commit -m "fix(mobile): swipe gesture off when on Kode tab

Prevents swipe-to-switch from competing with Monaco's horizontal
scroll on the code panel.

```

---

### Task 7: Playwright device captures + tier-1 asserts

**Files:**
- Create: `tests/mobile/workspace-capture.spec.ts`

- [ ] **Step 1: Write the device capture spec**

Create `tests/mobile/workspace-capture.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "iphone-se", width: 375, height: 667 },
  { name: "iphone-14", width: 390, height: 844 },
  { name: "iphone-16-pro-max", width: 430, height: 932 },
  { name: "pixel-7", width: 412, height: 915 },
  { name: "ipad", width: 768, height: 1024 },
];

for (const vp of VIEWPORTS) {
  test(`workspace /projects/[id] @ ${vp.name} (${vp.width}x${vp.height})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    // Visit a project the user can access. Auth handled by test fixture.
    await page.goto("/projects/<test-project-id>");

    // Tier-1: no horizontal overflow at this viewport.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, "horizontal overflow").toBeLessThanOrEqual(0);

    // Tier-1: every visible button has width >= 44 in the top bar.
    const topBarButtons = await page
      .locator("nav[aria-label='Pilih tampilan ruang kerja'] button, [aria-label='Buka menu']")
      .all();
    for (const button of topBarButtons) {
      const box = await button.boundingBox();
      expect(box?.width ?? 0, "tap target width").toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0, "tap target height").toBeGreaterThanOrEqual(44);
    }

    // Tier-2: save screenshot.
    await page.screenshot({
      path: `__captures__/mobile/workspace-${vp.name}.png`,
      fullPage: false,
    });
  });
}
```

- [ ] **Step 2: Run the spec**

Run: `bunx playwright test tests/mobile/workspace-capture.spec.ts`
Expected: PASS at all 5 viewports. If any fails (overflow or tap-target), investigate and fix before continuing.

- [ ] **Step 3: Hand off to user for tier-3 native-feel review**

Tell the user:
> Tier-2 captures saved to `__captures__/mobile/workspace-*.png`. Please review on device (or open each PNG). If any surface fails "feels native," note the surface + viewport + what's wrong. Iterate until signed off.

- [ ] **Step 4: Commit the spec (skips captures dir — gitignored)**

```bash
git add tests/mobile/workspace-capture.spec.ts
git commit -m "test(mobile): workspace device-capture tier-1 + tier-2

Playwright spec asserts no horizontal overflow and 44pt tap targets
at iPhone SE / 14 / 16 Pro Max / Pixel 7 / iPad viewports. Saves
screenshots to __captures__/mobile/ for tier-3 human review.

```

---

### Task 8: Final verify + handoff

**Files:** none modified.

- [ ] **Step 1: Run local check**

Run: `bun run check`
Expected: all green.

- [ ] **Step 2: Run local verify**

Run: `bun run verify`
Expected: all green (format + lint + typecheck + tests + Knip + route regen).

- [ ] **Step 3: Update DEV.md if any new pattern was introduced**

If the kebab menu or `pb-[env(safe-area-inset-bottom)]` pattern is new and worth documenting for future agents, add a one-line note to DEV.md. Skip otherwise (no scope creep).

- [ ] **Step 4: Push and watch CI**

Run: `/push-dev` (use the `push-dev` skill). Verify CI passes on the dev branch.

- [ ] **Step 5: Final report**

Summarize what shipped, link the tier-2 captures, note any tier-3 feedback the user gave, and confirm no regressions.