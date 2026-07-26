# Specification: UI Enhancements, Mode Switchers, Auto-scroll & Copy Updates

## 1. Context & Objectives
This specification covers a set of user interface improvements, mode/viewport switcher standardization, and auto-scroll helper button additions.

*Note: The issue regarding workspace card retrieval is excluded from this scope as requested by the user. Terms of Service, Privacy Policy, and Homepage copy updates are also excluded.*

## 2. Proposed Changes

### A. Preview Build Loader Update (`src/components/projects/WorkspaceShell.tsx`)
* **Current Behavior**: When building, a detailed steps-by-step progress panel (`BuildProgressPanel`) is rendered in both the chat messages scroll pane and the preview/iframe container.
* **Proposed Update**: Remove the `BuildProgressPanel` from the preview pane container while `isBuilding` is true. Replace it with a clean loading spinner and the text `"Menyiapkan pratinjau website..."` in the center of the preview pane. The detailed build step progress panel will continue to render inside the chat messages scroll pane.

### B. File Tree Collapse by Default (`src/components/projects/WorkspaceShell.tsx`)
* **Current Behavior**: In the "Kode" tab panel, all directory folders in the tree are expanded on load (`<details open className="group">`), creating clutter.
* **Proposed Update**: Change folder rendering to:
  ```tsx
  const isParent = selectedPath.startsWith(node.path + "/");
  return (
    <details key={node.path + "-" + isParent} defaultOpen={isParent} className="group">
  ```
  This ensures that only the parent directories containing the currently selected file are open/expanded by default on mount/update, while all other folders remain collapsed.

### C. Standardized Segmented Tab Controls & Sliding Animation
* **Current Behavior**: Switchers/toggles are styled inconsistently and lack a unified size and sliding transition:
  * "Tampilan / Kode" are tab buttons.
  * "Komputer / HP" are standalone buttons.
  * "Pilihan / Tulis bebas" are rounded pills with a sliding background.
* **Proposed Update**:
  * Unify all three segmented control toggles to use a consistent layout, size, and sliding transition:
    * Container height: `h-9` (36px), padding: `p-0.5` (2px), border radius: `rounded-radius-md` (or `rounded-lg`).
    * Inner buttons: `h-8` (32px) height, `rounded-radius-sm` (or `rounded-md`), and text size `text-xs`.
    * Active state uses a white background (`bg-surface-warm-white text-foreground-primary`) sliding transition using `framer-motion`'s `layoutId`.
  * Convert the "Komputer / HP" viewport switcher in `WorkspaceTopBar` to use `TabButton` (with `layoutId` and `role="tab"` / `role="tablist` accessibility) so it behaves as a proper tab list.
  * Standardize all other standalone buttons in `WorkspaceTopBar` (chat panel collapse, annotation/Ubah toggle, Buka link, Terbitkan button) to use height `h-9` (36px) and `px-3` or `w-9`/`h-9` to match.
  * Adjust "Pilihan" vs "Tulis bebas" toggle in `WorkspaceShell.tsx` to match this exact height, padding, border-radius, and text styling.

### D. Chat Pane Auto-Scroll & "Lompat ke Bawah" Button (`src/components/projects/WorkspaceShell.tsx`)
* **Current Behavior**: When the user scrolls up in the chat pane, auto-scrolling disables to prevent layout shifts. It's difficult to jump back to the bottom when new progress or messages arrive.
* **Proposed Update**:
  * Track `showScrollToBottom` state in `WorkspaceShell.tsx` based on scroll container position (`!isChatNearBottom`).
  * If the user scrolls up and is not near the bottom, render a floating, center-aligned "Lompat ke Bawah" button (absolute `bottom-4 left-1/2 -translate-x-1/2` inside a relative parent wrapper of the chat scroll view).
  * When clicked, scroll the viewport smoothly to the bottom and re-enable auto-scroll (`shouldStickToBottomRef.current = true`).

### E. Paperclip (Attachment) Button in Default Chat Composer (`src/components/projects/WorkspaceShell.tsx`)
* **Problem**: The attachment button (paperclip) is currently missing from the default `composer-free` fallback form (Discuss/Build mode). It is only available in the structured question free-text composer.
* **Solution**:
  * Render `{pendingAttachments.length > 0 && <ComposerAttachments attachments={pendingAttachments} onRemove={(id) => setPendingAttachments((cur) => removeAttachment(cur, id))} />}` above the textarea in the default form.
  * Render `ComposerAttachButton` inside the button row next to the submit button.

## 3. Impact Analysis & Testing Strategy
* **Regression Testing**: Ensure `bun run check` continues to pass without errors.
* **Manual Verification**: Run E2E preview locally. Switch views between "Tampilan" and "Kode", change viewports, click "Lompat ke Bawah" button on chat scrolls, and verify page styling.
