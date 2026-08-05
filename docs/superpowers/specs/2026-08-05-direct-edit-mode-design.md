# Direct Edit Mode — Design

**Date:** 2026-08-05
**Status:** Approved design; implementation not started
**Scope:** A frontend direct-manipulation edit mode inside generated project previews, distinct from the existing AI-commentary flow, plus wiring the currently dead "Ganti gambar" replace control.

## Problem / User Intention

Owners currently edit a generated preview only by **commentary**: click an element, type a comment, and the AI rebuilds the whole site from a text instruction. There is no way to directly rearrange, remove, or swap sections, and no local undo/redo. The "Ganti gambar" button shown when clicking an image in annotation mode is **dead** — `onReplaceImage` is never passed in `WorkspaceShell`.

The owner wants a **direct edit** mode:

- Drag and drop to reorder sections/elements.
- Remove a section/element they do not need.
- Undo/redo that current frontend state locally (temporary).
- A Save action that commits permanently and triggers the AI rebuild so the generated source matches the rearranged DOM.
- Paste/upload a replacement image onto an existing image (dead button fix).

Commentary stays separate: commentary sends a text prompt; direct edit manipulates the rendered DOM first, then commits.

## Verified Current Behavior

- The preview iframe is sandboxed `allow-scripts allow-same-origin allow-forms` (`WorkspacePrimitives.tsx:574`).
- An injected bridge (`runtime-proxy.ts`) already reads the DOM, builds `selectorPath`s, and posts `umkmcepat-annotation-target` to the parent. It can also mutate the DOM.
- `onReplaceImage` renders in the annotation popover (`WorkspacePrimitives.tsx:655`) but is never wired in `WorkspaceShell.tsx:3322`.
- `createImageReplaceEditInstruction` (`visual-annotations.ts:150`) exists but is called nowhere.
- Temp image upload → claim → project asset path already exists: `uploadTempImageFile` → `/api/projects/$id/assets/upload` (claims temp, moderates, persists `ProjectAsset` with a `/media/<id>` URL).
- Every edit already auto-creates a `ProjectSnapshot`; the History drawer restores them. So "save permanently" = trigger the existing `/api/projects/:id/edit` AI build.
- No drag-and-drop library exists in the repo. No undo/redo beyond snapshot restore.

## Goals

1. A new "Ubah langsung" (direct edit) mode, independent of commentary annotation.
2. Drag-and-drop reordering of editable blocks (sections/cards).
3. Remove an editable block.
4. Local undo/redo of the frontend state (buttons + `Ctrl+Z` / `Ctrl+Shift+Z`).
5. Save → builds an AI edit instruction from the rearranged DOM and triggers the existing `/api/projects/:id/edit` rebuild + snapshot.
6. Discard → clears local history and reloads the preview.
7. Wire the dead "Ganti gambar" control: paste/upload image → claim as project asset → `/media/<id>` → `image_replace` edit.
8. Keep commentary and direct edit as separate toggled modes.

## Non-Goals

- No in-code Monaco editing (code tab stays read-only).
- No live persistence of DOM changes without an AI rebuild (the source is static per build; DOM-only edits are temporary until Save).
- No new dependency: use native HTML5 drag-and-drop, not react-dnd/dnd-kit.
- No text editing inside blocks (only reorder + remove + image replace).
- No changes to the existing annotation payload contract.

## Architecture

### Edit-mode bridge (in `runtime-proxy.ts`)

A second message type `umkmcepat-edit-mode` activates/deactivates direct edit in the injected bridge. On activation, the bridge:

- Walks the DOM and marks editable **blocks** (atomic: `article`, `section`, `[data-umkm-annotatable]`, or class names matching `badge|card|capsule|chip|feature|item|pill|product|service|tag|tile`, plus semantic `section` containers). It assigns each a stable `data-umkm-id`.
- Adds a drag handle + remove button overlay on each block (hover to reveal).
- Reorders on HTML5 drag; toggles a `data-umkm-removed` flag + `display:none` instead of deleting nodes (so undo can restore).
- After every mutation, posts `umkmcepat-edit-state` to the parent with a **layout**: for each parent, the ordered list of block ids, plus the removed-id set, plus an `id → { selectorPath, label, tag }` map.
- Applies a parent-sent layout (undo/redo): reorders children and toggles removed/hidden per the supplied order + removed set.

### Parent state (in `WorkspaceShell`)

- `editMode: boolean` (the "Ubah langsung" toggle).
- A history stack of **layouts** (from the bridge). Undo pushes the current layout back onto redo; redo re-applies.
- `editHistoryReducer` (pure, Node-testable) owns push/undo/redo.
- On Save: build an Indonesian instruction from the diff between the original layout and the current layout (which ids were removed, which parents were reordered, in what order), then `POST /api/projects/:id/edit`. The existing batched-edit engine rebuilds source so it matches.
- On Discard: clear history and bump `previewReloadKey` to reload the preview.

### Image replace (dead button fix)

- Wire `onReplaceImage` in `WorkspaceShell`. It opens a file picker, calls `uploadTempImageFile`, claims via `/api/projects/:id/assets/upload` (purpose `business-image`), gets `/media/<id>`, then builds `createImageReplaceEditInstruction({ replaceWith, target })` and posts an `image_replace` edit to `/api/projects/:id/edit`.

## Bridge Message Contract

```ts
// Parent → bridge
{ type: "umkmcepat-edit-mode", active: boolean }
{ type: "umkmcepat-edit-layout", layout: EditLayout }

// Bridge → parent
{ type: "umkmcepat-edit-ready", layout: EditLayout }   // after activation
{ type: "umkmcepat-edit-state", layout: EditLayout }   // after each mutation

type EditBlockRef = { id: string; label: string; selectorPath: string; tag: string };
type EditLayout = {
  parents: Record<string, string[]>;   // parentId -> ordered child block ids
  parentRefs: Record<string, string>;  // parentId -> selectorPath
  removed: string[];                   // removed block ids
  blocks: Record<string, EditBlockRef>; // id -> block metadata (selectorPath for AI)
};
```

## Parent Toolbar UX

The `WorkspaceTopBar` gains, when a generated preview is available, a second mode toggle next to the existing "Ubah" commentary button:

- **"Ubah"** (commentary) — existing annotation mode, unchanged.
- **"Ubah langsung"** — toggles direct edit.

When direct edit is active, a small toolbar shows:

- **Undo** (disabled when no undo history).
- **Redo** (disabled when no redo history).
- **Simpan** — commits + rebuilds.
- **Batalkan** — discards local edits, reloads preview.

Keyboard: `Ctrl+Z` undo, `Ctrl+Shift+Z` / `Ctrl+Y` redo, only while direct edit is active.

## Save → Instruction Mapping

Save builds an Indonesian instruction such as:

```text
Rearrange the website sections exactly as follows. Reorder within each parent and remove sections marked "remove". Preserve all other content.

- Parent <selectorPath>:
  - order: <labelA>, <labelB>, <labelC>
- Remove (delete from the page entirely):
  - <labelB> (<selectorPath>)

Keep the overall layout otherwise unchanged. Do not change text or content.
```

The selectorPath for each id is captured at save time from the bridge's `blocks[id].selectorPath`.

## Testing Strategy

The bridge body is string-injected JS, so follow the existing pattern:

- **Pure helper tests** (Node Vitest): `editHistoryReducer` (push/undo/redo), and a pure `buildDirectEditInstruction(original, current, blocks)` that produces the Indonesian instruction. These carry the real logic.
- **String assertions** on the injected bridge script: contains `umkmcepat-edit-mode`, `umkmcepat-edit-layout`, `data-umkm-id`, drag/remove handler names.
- **Storybook**: a `DirectEditToolbar` stories file if a reusable toolbar is extracted.

## Verification

Focused verification:

```bash
bun test src/lib/projects/runtime-proxy.test.ts
bun test src/lib/projects/direct-edit.test.ts
bun test src/components/projects/WorkspaceShell.test.ts
```

Before handoff:

```bash
bun run check
```
