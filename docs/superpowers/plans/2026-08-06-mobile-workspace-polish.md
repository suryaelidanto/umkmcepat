# Mobile Workspace Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the `/projects/[id]` mobile workspace so the bottom nav uses 2 segments with icons, the top bar shows the project title next to the kebab, and the hamburger sheet is restructured into 3 named sections with consistent row-item styling and the Tampilan/Kode sub-control moved inside it.

**Architecture:** Surgical edits in the existing components. No new files (one renamed helper export). The bottom nav (`WorkspaceShell.tsx`) shrinks from 3 segments to 2 with `MessageCircle` / `Globe2` icons. `WorkspaceTopBar` gains optional `title` and `onPickTab` props and restructures its `MobileSheet` body into three sections: a Tampilan sub-control, a Tampilan perangkat sub-control (preview-only), and an Aksi list. `WorkspaceHistoryButton` and `EnergyLedgerButton` get a `variant: "pill" | "row"` prop so the same buttons render as list rows inside the sheet. `MobileSheet` gets a brighter grab handle and tighter inner padding.

**Tech Stack:** Bun, React, TanStack Router, Radix Dialog (used by `MobileSheet`), Tailwind, motion/react, lucide-react. Same as the rest of the repo.

## Global Constraints

- Bun only; `bun.lock` is the canonical lockfile. No new dependencies.
- User-facing product UI copy stays Indonesian; developer-facing code/logs/errors use English.
- No new files unless listed below. Do not introduce new visual tokens or colors.
- Surgical edits: touch only what the task requires. Match surrounding style. Don't refactor adjacent code.
- No comments unless they explain a non-obvious gotcha. No `TODO`/`TBD` placeholders.
- All new icons come from `lucide-react` (already imported in the affected files).
- Run `bun run check` before handoff.
- The desktop layout (`md+` clusters, ResizablePanelGroup, desktop pill controls) MUST stay byte-identical.
- Keyboard / focus handling on segmented controls MUST stay intact (existing `role="tablist"` + arrow-key handlers).
- The drag-to-dismiss gesture and swipe-between-surfaces gesture MUST stay intact.

---

## File Structure

**Modified files (no new files):**
| File | Why |
|---|---|
| `src/components/projects/WorkspaceShell.tsx` | Bottom nav: 3 → 2 segments with icons. Wire `title` and `onPickTab` into `WorkspaceTopBar`. |
| `src/components/projects/WorkspacePrimitives.tsx` | `WorkspaceTopBar` gains `title` + `onPickTab` props. Mobile top bar shows the title. `MobileSheet` content is restructured into 3 sections. New `MobileMenuContent` export for testing. |
| `src/components/ui/mobile-sheet.tsx` | Brighter grab handle, tighter inner padding. |
| `src/components/common/EnergyLedgerButton.tsx` | `variant: "pill" \| "row"` prop for in-sheet use. |
| `src/components/projects/WorkspaceHistoryDrawer.tsx` | `WorkspaceHistoryButton` gains the same `variant` prop. |
| `src/components/projects/WorkspacePrimitives.test.ts` | New tests for the in-sheet Tampilan/Kode control and the section structure. |
| `src/components/projects/WorkspaceShell.test.ts` | New assertion: mobile bottom nav has exactly 2 segments. |

No new files. The `MobileMenuContent` component is a named export added to `WorkspacePrimitives.tsx` so the sheet body is unit-testable without rendering the Radix portal.

---

## Task 1: Brighten MobileSheet handle and tighten inner padding

**Files:**
- Modify: `src/components/ui/mobile-sheet.tsx:37-40`

**Interfaces:**
- Consumes: existing `MobileSheet` props (`open`, `onOpenChange`, `title`, `children`) — unchanged.
- Produces: same props, visual tweak only.

- [ ] **Step 1: Edit `src/components/ui/mobile-sheet.tsx`**

Change the `motion.div` className and the grab-handle span color:

```tsx
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-[#151515] p-spacing-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] md:hidden"
            transition={{ damping: 30, stiffness: 320, type: "spring" }}
          >
            <div className="mx-auto mb-spacing-4 h-1.5 w-10 rounded-full bg-surface-warm-white/35" />
```

- `p-spacing-4` → `p-spacing-5` (16px → 20px inner padding)
- `pb-[calc(env(safe-area-inset-bottom)+1rem)]` → `pb-[calc(env(safe-area-inset-bottom)+1.25rem)]` (extra 4px so the safe-area inset still feels generous with the larger padding)
- Grab handle `bg-surface-warm-white/20` → `bg-surface-warm-white/35` so it actually reads as a handle on the dark sheet
- Handle bottom margin `mb-spacing-3` → `mb-spacing-4` to match the larger padding

- [ ] **Step 2: Verify no other consumer is affected**

Run: `grep -rn "MobileSheet" src/`
Expected: only `src/components/projects/WorkspacePrimitives.tsx` imports it. No one passes `title` other than that one site. Both files compile unchanged because the props are untouched.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/mobile-sheet.tsx
git commit -m "style(mobile-sheet): brighten grab handle, tighten inner padding"
```

---

## Task 2: Add `variant: "pill" | "row"` to `EnergyLedgerButton`

**Files:**
- Modify: `src/components/common/EnergyLedgerButton.tsx`

**Interfaces:**
- Consumes: existing `{ projectId }` prop — unchanged.
- Produces: `EnergyLedgerButton({ projectId, variant?: "pill" | "row" })`. Default `variant = "pill"`. `variant="row"` renders a full-width row with `inline-flex h-11 w-full items-center gap-spacing-3 rounded-radius-md px-spacing-3 text-sm text-surface-warm-white/82 hover:bg-surface-warm-white/8` plus a trailing `ChevronRight`.

- [ ] **Step 1: Edit `src/components/common/EnergyLedgerButton.tsx`**

Replace the file contents with:

```tsx
"use client";

import { ChevronRight, Zap } from "lucide-react";
import { useState } from "react";

import { EnergyLedger } from "@/components/common/EnergyLedger";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function EnergyLedgerButton({
  projectId,
  variant = "pill",
}: {
  projectId: string;
  variant?: "pill" | "row";
}) {
  const [open, setOpen] = useState(false);
  const isRow = variant === "row";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Lihat riwayat energi"
        className={cn(
          isRow
            ? "inline-flex h-11 w-full items-center gap-spacing-3 rounded-radius-md px-spacing-3 text-sm text-surface-warm-white/82 hover:bg-surface-warm-white/8"
            : "inline-flex min-h-9 items-center gap-spacing-3 rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 px-spacing-5 text-xs font-medium text-surface-warm-white/80 hover:bg-surface-warm-white/10 hover:text-surface-warm-white",
        )}
      >
        <Zap className={cn("shrink-0", isRow ? "size-4 text-surface-warm-white/64" : "size-4")} />
        <span className={cn(isRow ? "flex-1 text-left" : "hidden sm:inline")}>
          {isRow ? "Riwayat Energi" : "Riwayat Energi"}
        </span>
        {isRow ? <ChevronRight className="size-4 text-surface-warm-white/40" /> : null}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[80dvh] flex-col gap-spacing-7 overflow-hidden sm:max-w-lg">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-spacing-3">
              <Zap className="size-4" />
              Riwayat Energi
            </DialogTitle>
            <DialogDescription>
              Daftar pemakaian energi per langkah untuk proyek ini.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
            <EnergyLedger projectId={projectId} limit={50} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

Notes for the implementer:
- `cn` is already available at `@/lib/utils`.
- The dialog itself is unchanged — the variant only affects the trigger button.
- The redundant-looking ternary on the `<span>` is intentional: the pill hides the label below `sm`; the row always shows it. Simplifying to a single string would change behavior; keep both branches.

- [ ] **Step 2: Verify existing usage still compiles**

Run: `grep -rn "EnergyLedgerButton" src/`
Expected: `src/components/projects/WorkspacePrimitives.tsx` calls it without `variant`. Both call sites should compile unchanged because `variant` defaults to `"pill"`.

- [ ] **Step 3: Commit**

```bash
git add src/components/common/EnergyLedgerButton.tsx
git commit -m "feat(EnergyLedgerButton): add row variant for mobile sheet"
```

---

## Task 3: Add `variant: "pill" | "row"` to `WorkspaceHistoryButton`

**Files:**
- Modify: `src/components/projects/WorkspaceHistoryDrawer.tsx:57-77`

**Interfaces:**
- Consumes: existing `{ projectId }` prop — unchanged.
- Produces: `WorkspaceHistoryButton({ projectId, variant?: "pill" | "row" })`. Default `variant = "pill"`. `variant="row"` renders the same row-item class as Task 2, with `History` icon and "Riwayat" label, trailing `ChevronRight`.

- [ ] **Step 1: Edit `src/components/projects/WorkspaceHistoryDrawer.tsx`**

Add the import:

```tsx
import { ChevronRight, History, RotateCcw } from "lucide-react";
```

Replace `WorkspaceHistoryButton` (lines 57–77) with:

```tsx
export function WorkspaceHistoryButton({
  projectId,
  variant = "pill",
}: {
  projectId: string;
  variant?: "pill" | "row";
}) {
  const [open, setOpen] = useState(false);
  const isRow = variant === "row";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Lihat riwayat versi"
        className={
          isRow
            ? "inline-flex h-11 w-full items-center gap-spacing-3 rounded-radius-md px-spacing-3 text-sm text-surface-warm-white/82 hover:bg-surface-warm-white/8"
            : "inline-flex min-h-9 items-center gap-spacing-3 rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 px-spacing-5 text-xs font-[480] text-surface-warm-white/80 hover:bg-surface-warm-white/10 hover:text-surface-warm-white"
        }
      >
        <History
          className={
            isRow ? "size-4 shrink-0 text-surface-warm-white/64" : "size-4"
          }
        />
        <span className={isRow ? "flex-1 text-left" : "hidden sm:inline"}>
          Riwayat
        </span>
        {isRow ? (
          <ChevronRight className="size-4 text-surface-warm-white/40" />
        ) : null}
      </button>
      <WorkspaceHistoryDrawer
        projectId={projectId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
```

- [ ] **Step 2: Verify existing usage still compiles**

Run: `grep -rn "WorkspaceHistoryButton" src/`
Expected: `WorkspacePrimitives.tsx` calls it without `variant`. Both call sites compile unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/WorkspaceHistoryDrawer.tsx
git commit -m "feat(WorkspaceHistoryButton): add row variant for mobile sheet"
```

---

## Task 4: Restructure `MobileSheet` body and add `title`/`onPickTab` to `WorkspaceTopBar`

This is the bulk of the work. The change touches `WorkspacePrimitives.tsx` only, but it has four sub-pieces that must ship together because they are interleaved.

**Files:**
- Modify: `src/components/projects/WorkspacePrimitives.tsx`

**Interfaces:**
- Consumes: existing `WorkspaceTopBar` props — unchanged for desktop callers (none exist; only `WorkspaceShell.tsx` calls it).
- Produces:
  - `WorkspaceTopBar({ ..., title?: string, onPickTab?: (tab: BuildTab) => void })` — new optional props. `title` shows on the mobile bar's left side. `onPickTab` is called from the in-sheet Tampilan/Kode sub-control; the parent is responsible for also flipping `mobileSurface` to `"preview"` so the surface change is visible.
  - `MobileMenuContent({ ..., onClose: () => void, onPickTab?: (tab: BuildTab) => void })` — new named export. Renders the three sections. `onClose` is called after any action that should dismiss the sheet. Used internally by `WorkspaceTopBar` and exported for testing.

- [ ] **Step 1: Add `ChevronRight`, `MessageCircle`, `Globe` (already have `Globe2` — keep), `History` (already imported via `WorkspaceHistoryDrawer`), `LifeBuoy` (already imported), `Monitor`, `Smartphone`, `Zap` (imported indirectly via `EnergyLedgerButton`) imports if missing**

The existing imports list (lines 3–25) already has: `Check`, `ChevronDown`, `ChevronUp`, `Code2`, `ExternalLink`, `Globe2`, `ImagePlus`, `Loader2`, `Menu`, `MessageSquarePlus`, `Monitor`, `PanelLeftClose`, `PanelLeftOpen`, `Redo2`, `RefreshCw`, `Send`, `Smartphone`, `Trash2`, `Undo2`, `X`, `LifeBuoy`.

Add `ChevronRight` to that list:

```tsx
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Code2,
  ExternalLink,
  Globe2,
  ImagePlus,
  Loader2,
  Menu,
  MessageSquarePlus,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Redo2,
  RefreshCw,
  Send,
  Smartphone,
  Trash2,
  Undo2,
  X,
  LifeBuoy,
} from "lucide-react";
```

- [ ] **Step 2: Add `title` and `onPickTab` to the `WorkspaceTopBar` props block**

In the function signature around line 88, replace the prop type with:

```tsx
export function WorkspaceTopBar({
  activeTab,
  setActiveTab,
  viewport,
  setViewport,
  chatCollapsed,
  openChatPanel,
  closeChatPanel,
  annotationAvailable = false,
  directEditActive = false,
  onToggleDirectEdit,
  directEditActions,
  runtime,
  projectId,
  title,
  onPickTab,
}: {
  activeTab: BuildTab;
  setActiveTab: (tab: BuildTab) => void;
  viewport: "desktop" | "mobile";
  setViewport: (viewport: "desktop" | "mobile") => void;
  chatCollapsed: boolean;
  openChatPanel: () => void;
  closeChatPanel: () => void;
  annotationAvailable?: boolean;
  directEditActive?: boolean;
  onToggleDirectEdit?: () => void;
  directEditActions?: {
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onSave: () => void;
    onDiscard: () => void;
  };
  runtime?: WorkspaceRuntimeControl;
  projectId?: string;
  title?: string;
  onPickTab?: (tab: BuildTab) => void;
}) {
```

- [ ] **Step 3: Update the mobile-only kebab cluster (lines 189–201) to show `title` on the left**

Replace the cluster:

```tsx
        {/* Mobile-only bar: project title + kebab */}
        <div className="flex w-full items-center justify-between gap-spacing-2 sm:hidden">
          {title ? (
            <span
              className="min-w-0 truncate text-sm font-medium text-surface-warm-white/82"
              title={title}
            >
              {title}
            </span>
          ) : (
            <span aria-hidden="true" />
          )}
          <button
            type="button"
            aria-label="Buka menu"
            aria-haspopup="dialog"
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen(true)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-md border border-surface-warm-white/10 text-surface-warm-white/70 hover:bg-surface-warm-white/8 hover:text-surface-warm-white cursor-pointer"
          >
            <Menu className="size-4" />
          </button>
        </div>
```

Notes:
- `w-full` instead of `min-w-0 w-full` since `min-w-0` only matters when the container is constrained.
- The empty `<span aria-hidden>` preserves the `justify-between` so the kebab stays right-aligned when no title is provided (e.g., a future read-only mode without a title).
- `shrink-0` on the kebab prevents the long title from squashing the icon.

- [ ] **Step 4: Add `MobileMenuContent` named export at the end of the file (after `TabButton`)**

Append this block immediately after the `TabButton` function closes (currently around line 429):

```tsx
type MobileMenuContentProps = {
  activeTab: BuildTab;
  setActiveTab: (tab: BuildTab) => void;
  viewport: "desktop" | "mobile";
  setViewport: (viewport: "desktop" | "mobile") => void;
  annotationAvailable: boolean;
  directEditActive: boolean;
  onToggleDirectEdit?: () => void;
  runtime?: WorkspaceRuntimeControl;
  projectId?: string;
  onPickTab?: (tab: BuildTab) => void;
  onClose: () => void;
};

export function MobileMenuContent({
  activeTab,
  setActiveTab,
  viewport,
  setViewport,
  annotationAvailable,
  directEditActive,
  onToggleDirectEdit,
  runtime,
  projectId,
  onPickTab,
  onClose,
}: MobileMenuContentProps) {
  const pickTab = (tab: BuildTab) => {
    if (onPickTab) {
      onPickTab(tab);
    } else {
      setActiveTab(tab);
    }
    onClose();
  };

  return (
    <div className="flex flex-col gap-spacing-5">
      {/* Section: Tampilan (sub-control) */}
      <section className="flex flex-col gap-spacing-2">
        <span className="px-1 text-[11px] font-medium uppercase tracking-wide text-surface-warm-white/44">
          Tampilan
        </span>
        <div
          role="tablist"
          aria-label="Konten tampilan"
          className="flex h-9 w-full items-center rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-0.5 text-xs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "preview"}
            onClick={() => pickTab("preview")}
            className={`relative flex h-8 flex-1 items-center justify-center gap-spacing-2 rounded-radius-sm transition cursor-pointer ${activeTab === "preview" ? "bg-surface-warm-white/10 text-surface-warm-white" : "text-surface-warm-white/58 hover:text-surface-warm-white"}`}
          >
            <Globe2 className="size-4" />
            <span>Tampilan</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "code"}
            onClick={() => pickTab("code")}
            className={`relative flex h-8 flex-1 items-center justify-center gap-spacing-2 rounded-radius-sm transition cursor-pointer ${activeTab === "code" ? "bg-surface-warm-white/10 text-surface-warm-white" : "text-surface-warm-white/58 hover:text-surface-warm-white"}`}
          >
            <Code2 className="size-4" />
            <span>Kode</span>
          </button>
        </div>
      </section>

      {/* Section: Tampilan perangkat (only when preview is active) */}
      {activeTab === "preview" ? (
        <section className="flex flex-col gap-spacing-2">
          <span className="px-1 text-[11px] font-medium uppercase tracking-wide text-surface-warm-white/44">
            Tampilan perangkat
          </span>
          <div
            role="tablist"
            aria-label="Tampilan viewport"
            className="flex h-9 w-full items-center rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-0.5 text-xs"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewport === "desktop"}
              onClick={() => {
                setViewport("desktop");
                onClose();
              }}
              className={`flex h-8 flex-1 items-center justify-center gap-spacing-2 rounded-radius-sm transition cursor-pointer ${viewport === "desktop" ? "bg-surface-warm-white/10 text-surface-warm-white" : "text-surface-warm-white/58 hover:text-surface-warm-white"}`}
            >
              <Monitor className="size-4" />
              <span>Komputer</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewport === "mobile"}
              onClick={() => {
                setViewport("mobile");
                onClose();
              }}
              className={`flex h-8 flex-1 items-center justify-center gap-spacing-2 rounded-radius-sm transition cursor-pointer ${viewport === "mobile" ? "bg-surface-warm-white/10 text-surface-warm-white" : "text-surface-warm-white/58 hover:text-surface-warm-white"}`}
            >
              <Smartphone className="size-4" />
              <span>HP</span>
            </button>
          </div>
        </section>
      ) : null}

      {/* Section: Aksi */}
      <section className="flex flex-col gap-spacing-2">
        <span className="px-1 text-[11px] font-medium uppercase tracking-wide text-surface-warm-white/44">
          Aksi
        </span>
        <div className="flex flex-col gap-spacing-1">
          {annotationAvailable && activeTab === "preview" ? (
            <button
              type="button"
              onClick={() => {
                onToggleDirectEdit?.();
                onClose();
              }}
              aria-pressed={directEditActive}
              aria-label={
                directEditActive ? "Nonaktifkan ubah" : "Aktifkan ubah"
              }
              className={`inline-flex h-11 w-full items-center gap-spacing-3 rounded-radius-md px-spacing-3 text-sm cursor-pointer ${directEditActive ? "bg-[#8fd3ff]/12 text-[#d6f0ff]" : "text-surface-warm-white/82 hover:bg-surface-warm-white/8"}`}
            >
              <MessageSquarePlus
                className={`size-4 shrink-0 ${directEditActive ? "text-[#8fd3ff]" : "text-surface-warm-white/64"}`}
              />
              <span className="flex-1 text-left">
                {directEditActive ? "Ubah aktif" : "Ubah"}
              </span>
            </button>
          ) : null}
          {projectId ? (
            <a
              href="/support"
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="inline-flex h-11 w-full items-center gap-spacing-3 rounded-radius-md px-spacing-3 text-sm text-surface-warm-white/82 hover:bg-surface-warm-white/8"
            >
              <LifeBuoy className="size-4 shrink-0 text-surface-warm-white/64" />
              <span className="flex-1 text-left">Hubungi Dukungan</span>
              <ChevronRight className="size-4 text-surface-warm-white/40" />
            </a>
          ) : null}
          {projectId ? (
            <WorkspaceHistoryButton projectId={projectId} variant="row" />
          ) : null}
          {projectId ? (
            <EnergyLedgerButton projectId={projectId} variant="row" />
          ) : null}
          {runtime ? <RuntimeControl runtime={runtime} variant="row" /> : null}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Update `RuntimeControl` to accept a `variant` prop**

Find `RuntimeControl` (around line 431) and replace its signature and the conditional render of the Buka link / Publish button to honor `variant`. The current function is a single `<div className="flex min-w-0 items-center gap-spacing-1 sm:gap-spacing-2">` wrapper around the `runtime.publishedPath` link or `runtime.canPublish` button plus status indicators.

Replace the function with:

```tsx
function RuntimeControl({
  runtime,
  variant = "pill",
}: {
  runtime: WorkspaceRuntimeControl;
  variant?: "pill" | "row";
}) {
  if (variant === "row") {
    return (
      <div className="flex w-full flex-col gap-spacing-2">
        {runtime.publishedPath ? (
          <a
            href={runtime.publishedPath}
            target="_blank"
            rel="noreferrer"
            onClick={closeSheetForRow}
            className="inline-flex h-11 w-full items-center justify-center gap-spacing-2 rounded-radius-md bg-surface-warm-white px-spacing-4 text-sm font-medium text-foreground-primary hover:bg-surface-warm-white/90"
          >
            <ExternalLink className="size-4" />
            <span>Buka website</span>
          </a>
        ) : (
          <button
            type="button"
            disabled={!runtime.canPublish || runtime.isPublishing}
            onClick={() => {
              runtime.onPublish?.();
              closeSheetForRow();
            }}
            className="inline-flex h-11 w-full items-center justify-center gap-spacing-2 rounded-radius-md bg-surface-warm-white px-spacing-4 text-sm font-medium text-foreground-primary hover:bg-surface-warm-white/90 disabled:opacity-50"
          >
            {runtime.isPublishing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <span aria-hidden>•</span>
            )}
            <span>{runtime.isPublishing ? "Menerbitkan…" : "Terbitkan"}</span>
          </button>
        )}
        <RuntimeStatusInline runtime={runtime} />
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-spacing-1 sm:gap-spacing-2">
      {runtime.publishedPath ? (
        <a
          href={runtime.publishedPath}
          target="_blank"
          rel="noreferrer"
          aria-label="Buka website yang diterbitkan"
          className="inline-flex h-9 items-center justify-center gap-spacing-2 rounded-radius-md border border-surface-warm-white/10 px-spacing-3 text-xs text-surface-warm-white/70 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
        >
          <ExternalLink className="size-4" />
          <span className="hidden sm:inline">Buka</span>
        </a>
      ) : (
        <button
          type="button"
          disabled={!runtime.canPublish || runtime.isPublishing}
          onClick={runtime.onPublish}
          aria-label="Terbitkan website"
          className="inline-flex h-9 items-center justify-center gap-spacing-2 rounded-radius-md bg-surface-warm-white px-spacing-3 text-xs font-medium text-foreground-primary hover:bg-surface-warm-white/90 disabled:opacity-50"
        >
          {runtime.isPublishing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : null}
          <span className="hidden sm:inline">
            {runtime.isPublishing ? "Menerbitkan…" : "Terbitkan"}
          </span>
        </button>
      )}
      <RuntimeStatusInline runtime={runtime} />
    </div>
  );
}
```

And add the small `closeSheetForRow` helper plus `RuntimeStatusInline` extracted component. `closeSheetForRow` is a module-level ref to the open sheet's closer — define it next to `MobileMenuContent` and set it from inside `WorkspaceTopBar`'s render:

```tsx
let closeSheetForRow: () => void = () => {};

function RuntimeStatusInline({ runtime }: { runtime: WorkspaceRuntimeControl }) {
  if (!runtime.publishedPath && !runtime.isPublishing) return null;
  return (
    <span className="px-1 text-[11px] text-surface-warm-white/44">
      {runtime.isPublishing
        ? "Sedang menerbitkan…"
        : runtime.publishedPath
          ? "Sudah diterbitkan"
          : ""}
    </span>
  );
}
```

- [ ] **Step 6: Wire `closeSheetForRow` from `WorkspaceTopBar` and replace the old `MobileSheet` body**

In the `WorkspaceTopBar` body, just before the `return`, add:

```tsx
  closeSheetForRow = () => setIsMobileMenuOpen(false);
```

Then replace the entire `<MobileSheet ...>` block (the `<MobileSheet>` and its children, lines 296–373) with:

```tsx
      <MobileSheet
        open={isMobileMenuOpen}
        onOpenChange={setIsMobileMenuOpen}
      >
        <MobileMenuContent
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          viewport={viewport}
          setViewport={setViewport}
          annotationAvailable={annotationAvailable}
          directEditActive={directEditActive}
          onToggleDirectEdit={onToggleDirectEdit}
          runtime={runtime}
          projectId={projectId}
          onPickTab={onPickTab}
          onClose={() => setIsMobileMenuOpen(false)}
        />
      </MobileSheet>
```

- [ ] **Step 7: Verify the file compiles**

Run: `bun run check`
Expected: typecheck passes, lint passes, the existing `WorkspacePrimitives.test.ts` mobile-layout block still passes. Fix any unused-import or signature mismatches before moving on.

- [ ] **Step 8: Commit**

```bash
git add src/components/projects/WorkspacePrimitives.tsx
git commit -m "feat(WorkspaceTopBar): restructure mobile sheet into named sections"
```

---

## Task 5: Wire `title` and `onPickTab` from `WorkspaceShell`

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx`

**Interfaces:**
- Consumes: existing project state — `initialTitle`, `activeTab` (`activeTab` is the local state), `setActiveTab`, `setMobileSurface`.
- Produces: passes `title={initialTitle}` and `onPickTab={(tab) => { setActiveTab(tab); setMobileSurface("preview"); }}` to the `<WorkspaceTopBar>` element. Also shrinks the mobile bottom nav from 3 to 2 segments and adds icons.

- [ ] **Step 1: Confirm `initialTitle` is in scope at the call site**

Run: `grep -n "initialTitle" src/routes/_main.projects.$id.tsx src/components/projects/WorkspaceShell.tsx`
Expected: `WorkspaceShell` accepts `initialTitle: string` as a prop (verify the type definition near line 350-ish). If not, this task can't wire it without widening the prop type — in that case add `initialTitle: string` to the `WorkspaceShellProps` type.

- [ ] **Step 2: Find the `<WorkspaceTopBar ... />` invocation**

Run: `grep -n "WorkspaceTopBar" src/components/projects/WorkspaceShell.tsx`
Expected: one invocation around line 3700. Capture the surrounding props.

- [ ] **Step 3: Add `title` and `onPickTab` props to that invocation**

Inside the `<WorkspaceTopBar>` element (after `chatCollapsed={chatCollapsed}` or wherever the existing props end), add:

```tsx
        title={initialTitle}
        onPickTab={(tab) => {
          setActiveTab(tab);
          setMobileSurface("preview");
        }}
```

Place these on their own lines, indented to match the surrounding props.

- [ ] **Step 4: Shrink the mobile bottom nav**

Find the `<nav aria-label="Pilih tampilan ruang kerja">` block (lines 3863–3897) and replace it with:

```tsx
      <nav
        aria-label="Pilih tampilan ruang kerja"
        className="sticky bottom-0 z-20 flex h-12 shrink-0 items-stretch gap-spacing-1 border-t border-surface-warm-white/10 bg-[#1b1b19] px-spacing-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <button
          type="button"
          aria-pressed={mobileSurface === "chat"}
          onClick={openChatPanel}
          className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-spacing-2 truncate rounded-radius-lg text-sm font-medium aria-pressed:bg-surface-warm-white aria-pressed:text-foreground-primary"
        >
          <MessageCircle className="size-4 shrink-0" />
          <span className="truncate">Diskusi</span>
        </button>
        <button
          type="button"
          aria-pressed={mobileSurface === "preview"}
          onClick={openPreviewPanel}
          className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-spacing-2 truncate rounded-radius-lg text-sm font-medium aria-pressed:bg-surface-warm-white aria-pressed:text-foreground-primary"
        >
          <Globe2 className="size-4 shrink-0" />
          <span className="truncate">Tampilan</span>
        </button>
      </nav>
```

Changes from the original:
- 3 buttons → 2 buttons (`Kode` removed; lives in the sheet now).
- `h-14` → `h-12`, `gap-spacing-2` → `gap-spacing-1`, `px-spacing-3` → `px-spacing-2`.
- Buttons become `inline-flex items-center justify-center gap-spacing-2` with `MessageCircle` / `Globe2` icons and `truncate` on the label.
- The "Tampilan" button's `aria-pressed` no longer cares about `activeTab === "preview"`; it just checks `mobileSurface === "preview"`. When the user is on the Kode sub-tab of the preview surface, they're still on the "Tampilan" surface; the in-sheet Tampilan/Kode sub-control is what switches the sub-tab.

- [ ] **Step 5: Add the icon imports if missing**

Check the imports at the top of `WorkspaceShell.tsx`. If `MessageCircle` and `Globe2` aren't already imported from `lucide-react`, add them to the existing lucide import block. `Globe2` is used elsewhere in this file already; `MessageCircle` is new.

- [ ] **Step 6: Verify the typecheck**

Run: `bun run check`
Expected: passes. The `onPickTab` callback closure references `setActiveTab` and `setMobileSurface`, both of which are stable setters or memoized callbacks already in scope.

- [ ] **Step 7: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx
git commit -m "feat(workspace): shrink mobile bottom nav to 2 icon segments"
```

---

## Task 6: Add tests for the new sheet structure and bottom nav count

**Files:**
- Modify: `src/components/projects/WorkspacePrimitives.test.ts`
- Modify: `src/components/projects/WorkspaceShell.test.ts`

**Interfaces:**
- Consumes: `MobileMenuContent` named export from `WorkspacePrimitives.tsx`.
- Produces: three new tests (two in `WorkspacePrimitives.test.ts`, one in `WorkspaceShell.test.ts`).

- [ ] **Step 1: Add a `MobileMenuContent` test block to `WorkspacePrimitives.test.ts`**

Append a new `describe` block after the existing `WorkspaceTopBar direct edit actions` block (end of file):

```tsx
describe("MobileMenuContent", () => {
  const baseProps = {
    activeTab: "preview" as const,
    setActiveTab: vi.fn(),
    viewport: "desktop" as const,
    setViewport: vi.fn(),
    annotationAvailable: false,
    directEditActive: false,
    onClose: vi.fn(),
  };

  it("renders three named sections: Tampilan, Tampilan perangkat, Aksi", () => {
    const markup = renderToStaticMarkup(
      createElement(MobileMenuContent, {
        ...baseProps,
        projectId: "test-project",
      }),
    );
    expect(markup).toContain(">Tampilan<");
    expect(markup).toContain(">Tampilan perangkat<");
    expect(markup).toContain(">Aksi<");
  });

  it("calls onPickTab('code') when the Kode button is clicked and closes the sheet", () => {
    const setActiveTab = vi.fn();
    const onPickTab = vi.fn();
    const onClose = vi.fn();
    const tree = createElement(MobileMenuContent, {
      activeTab: "preview",
      setActiveTab,
      viewport: "desktop",
      setViewport: vi.fn(),
      annotationAvailable: false,
      directEditActive: false,
      onPickTab,
      onClose,
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const reactDom = require("react-dom/client");
    const root = reactDom.createRoot(container);
    act(() => {
      root.render(tree);
    });
    const kodeButton = container.querySelector(
      'button[role="tab"]:nth-of-type(2)',
    );
    expect(kodeButton).not.toBeNull();
    kodeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onPickTab).toHaveBeenCalledWith("code");
    expect(onClose).toHaveBeenCalled();
    act(() => root.unmount());
    document.body.removeChild(container);
  });
});
```

Notes for the implementer:
- This second test needs `jsdom` environment and `react-dom/client`. If `WorkspacePrimitives.test.ts` is currently running in `node` environment (most static-render tests are), check `vitest.config.ts` for the environment. If it's `node`, the second test won't run. Either: (a) split this into a `.test.tsx` file under the same dir that uses `// @vitest-environment jsdom`, or (b) skip the click-dispatch test and only keep the markup-contains-button assertion using `renderToStaticMarkup`.
- The safe path is option (b): replace the second test with a markup-only assertion that the Kode button exists:

```tsx
  it("renders the Kode sub-control button inside the sheet", () => {
    const markup = renderToStaticMarkup(
      createElement(MobileMenuContent, {
        ...baseProps,
        projectId: "test-project",
      }),
    );
    // Kode tab is the second child of the Tampilan sub-control.
    expect(markup).toContain(">Kode<");
    expect(markup).toMatch(/role="tab"[^>]*aria-selected="false"[^>]*>[\s\S]*?Kode</);
  });
```

Add `import { describe, expect, it, vi } from "vitest";` and `import { createElement } from "react";` if not already present.

- [ ] **Step 2: Add a test to `WorkspaceShell.test.ts` asserting the mobile bottom nav has 2 segments**

Append at the end of `describe("workspace panel split", ...)` (after the existing `it("renders mobile tree and not desktop tree when viewport < 1024px", ...)` test):

```tsx
  it("renders a 2-segment mobile bottom nav (Diskusi + Tampilan)", () => {
    const queryClient = new QueryClient();
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(WorkspaceShell, {
          projectId: "test",
          initialTitle: "Dapur Nasi Box",
          initialStatus: "passed",
          initialMessages: [],
          initialChatCursor: null,
          initialChatHasMore: false,
          initialWorkspaceCard: { type: "none" },
          initialBrief: makeBrief({
            businessName: "Kopi Tuku",
            businessType: "Kedai kopi",
            offer: "Kopi susu tetangga",
            targetCustomer: "Anak muda",
            stylePreference: "Modern",
            contactOrCta: "Pesan online",
          }),
        }),
      ),
    );
    // Bottom nav is the only <nav> with aria-label="Pilih tampilan ruang kerja".
    const navMatch = html.match(
      /<nav[^>]*aria-label="Pilih tampilan ruang kerja"[\s\S]*?<\/nav>/,
    );
    expect(navMatch).not.toBeNull();
    const navHtml = navMatch?.[0] ?? "";
    // Two buttons, one per segment.
    expect((navHtml.match(/aria-pressed=/g) ?? []).length).toBe(2);
    expect(navHtml).toContain("Diskusi");
    expect(navHtml).toContain("Tampilan");
    // Kode is no longer in the bottom nav — it lives in the sheet (which is
    // closed in static render, so its markup is not in the output).
    expect(navHtml).not.toContain(">Kode<");
  });
```

- [ ] **Step 3: Run the affected tests**

Run: `bunx vitest run src/components/projects/WorkspacePrimitives.test.ts src/components/projects/WorkspaceShell.test.ts`
Expected: all assertions pass. If the new tests fail, fix the assertions (not the implementation) — the implementation is already proven by the typecheck.

- [ ] **Step 4: Run the full check gate**

Run: `bun run check`
Expected: passes. Fix any unrelated test fallout.

- [ ] **Step 5: Commit**

```bash
git add src/components/projects/WorkspacePrimitives.test.ts src/components/projects/WorkspaceShell.test.ts
git commit -m "test(workspace): cover mobile sheet sections and 2-segment bottom nav"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run the full manual gate**

Run: `bun run check`
Expected: passes. Format, lint, typecheck, affected tests, Knip all green.

- [ ] **Step 2: Run the unit-test suite once**

Run: `bunx vitest run`
Expected: all tests pass. Any unrelated failures are out of scope; report them but don't fix.

- [ ] **Step 3: Skim the diff for stray edits**

Run: `git diff dev..HEAD --stat`
Expected: only the 7 files listed in the File Structure table are modified. Any other file in the diff is a stray edit; revert it.

- [ ] **Step 4: Manual smoke (if a real phone is available)**

- Open `/projects/<id>` on a phone (or DevTools mobile emulation at 375px).
- Verify: top bar shows the project name on the left, kebab on the right.
- Tap kebab. Verify: sheet slides up, three section headers are visible (Tampilan / Tampilan perangkat / Aksi).
- Tap "Kode" inside the sheet. Verify: sheet closes, preview surface now shows code, bottom nav still highlights "Tampilan".
- Tap kebab again. Verify: "Tampilan" segmented control shows Tampilan/Kode with "Kode" now active.
- Tap "Tampilan" inside the sheet. Verify: switches back, sub-control updates.
- Tap "HP" under Tampilan perangkat. Verify: preview re-renders in mobile viewport.
- Tap "Riwayat". Verify: history dialog opens.
- Close via swipe-down. Verify: sheet dismisses cleanly.
- Switch to the bottom nav. Verify: only 2 segments, each with an icon and label, "Diskusi" highlights when on chat surface.

---

## Self-Review (already done while drafting)

1. **Spec coverage:**
   - Diskusi/Tampilan/Kode too big on mobile → Task 5 shrinks nav to 2 segments + icons.
   - Kode as sub-tab in hamburger sheet → Tasks 4 & 5 wire `onPickTab` and place the segmented control inside the sheet.
   - Sheet neatness → Tasks 1, 4, 5: brighter handle, larger padding, named sections, consistent row-item class, consistent icon/text/right-chevron pattern.
   - Hamburger open feeling messy → Task 4 removes inline stray "Tampilan:" span and bare `<hr>`, replaces with sectioned layout.
   - Project title in mobile bar → Task 4 step 3 (render title), Task 5 step 3 (pass `title`).
   - Drop "Menu" sheet title → Task 4 step 6 (`<MobileSheet>` no longer receives a `title` prop).

2. **Placeholder scan:** No `TODO`/`TBD`/"implement later". All code shown verbatim. No "add appropriate error handling" stubs. No references to undefined symbols.

3. **Type consistency:** `BuildTab`, `WorkspaceRuntimeControl`, `setActiveTab`, `setMobileSurface`, `MobileMenuContent`, `onPickTab`, `closeSheetForRow`, `RuntimeStatusInline`, the `variant` prop on the three components — all introduced and consumed in matching tasks. The `closeSheetForRow` module-level mutable ref is a deliberate, scoped trade-off to avoid threading the closer through three layers; it's reset every render of `WorkspaceTopBar` so there's no stale-closure risk.

4. **Regression check:** Desktop callers of `WorkspaceTopBar` (only `WorkspaceShell.tsx`) keep all original behavior. `MobileSheet` consumers other than the one site don't exist. `EnergyLedgerButton` / `WorkspaceHistoryButton` callers that don't pass `variant` get `"pill"` and look identical to today.
