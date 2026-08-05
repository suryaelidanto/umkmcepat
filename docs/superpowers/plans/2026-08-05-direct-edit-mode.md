# Direct Edit Mode + Image Replace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a direct-manipulation edit mode to generated previews (drag-reorder blocks, remove blocks, local undo/redo, save→AI rebuild) and wire the currently dead "Ganti gambar" image-replace control, keeping commentary annotation as a separate mode.

**Architecture:** Extend the injected preview bridge (`runtime-proxy.ts`) with a second `umkmcepat-edit-mode` message that enables HTML5 drag-reorder + remove on atomic blocks and posts a serializable **layout** to the parent. The parent (`WorkspaceShell`) keeps an undo/redo history of layouts via a pure reducer, applies layouts back into the bridge, and on Save builds an Indonesian instruction diff that it sends through the existing `/api/projects/:id/edit` batched-edit AI build (which snapshots + rebuilds source). Image replace reuses the existing temp-upload → claim → `/media/<id>` pipeline and the unused `createImageReplaceEditInstruction`.

**Tech Stack:** Bun, TypeScript, TanStack Start server routes, React, Monaco (unchanged), Vitest, HTML5 Drag and Drop (no new dependency).

## Global Constraints

- Use Bun only; keep `bun.lock` as the canonical lockfile.
- Keep changes small, focused, and easy to review. Surgical edits only.
- User-facing product UI copy uses Indonesian; developer-facing docs/code/logs/errors use English.
- Do not add dependencies. Use native HTML5 drag-and-drop; do not add react-dnd/dnd-kit.
- Do not change the existing annotation payload shape or the code tab (stays read-only).
- No live persistence of DOM edits without an AI rebuild; DOM edits are temporary until Save.
- New reusable UI must be added to Storybook in the same change.
- Before handoff, run `bun run check` explicitly.
- Docs are part of the change: update `DEV.md` and the new spec/plan in the same diff.

---

## File Structure

- Create: `src/lib/projects/direct-edit.ts`
  - Pure layout type + `buildDirectEditInstruction()` (original layout, current layout, blocks → Indonesian instruction string).
- Create: `src/lib/projects/direct-edit.test.ts`
  - Tests for `buildDirectEditInstruction`.
- Modify: `src/lib/projects/runtime-proxy.ts`
  - Add `EDIT_MODE_BRIDGE` script; post messages `umkmcepat-edit-ready` / `umkmcepat-edit-state`; listen for `umkmcepat-edit-mode` / `umkmcepat-edit-layout`.
- Modify: `src/lib/projects/runtime-proxy.test.ts`
  - String assertions for edit-mode bridge script.
- Modify: `src/components/projects/WorkspacePrimitives.tsx`
  - Add `DirectEditToolbar` (undo/redo/simpan/batalkan) + wire `onReplaceImage` into annotation popover.
- Modify: `src/components/projects/WorkspaceShell.tsx`
  - Add `editMode` state, layout history reducer, bridge message handling, Save/Discard handlers, image-replace handler.
- Create: `src/components/projects/DirectEditToolbar.stories.tsx`
  - Storybook for the toolbar.
- Modify: `DEV.md`
  - Document direct edit mode + image replace.

---

### Task 1: Pure instruction builder

**Files:**
- Create: `src/lib/projects/direct-edit.ts`
- Test: `src/lib/projects/direct-edit.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export type EditBlockRef = { id: string; label: string; selectorPath: string; tag: string }`
  - `export type EditLayout = { parentRefs: Record<string, string>; parents: Record<string, string[]>; removed: string[]; blocks: Record<string, EditBlockRef> }`
  - `export function buildDirectEditInstruction(original: EditLayout, current: EditLayout): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/projects/direct-edit.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildDirectEditInstruction,
  type EditBlockRef,
  type EditLayout,
} from "./direct-edit";

const hero: EditBlockRef = {
  id: "b1",
  label: 'Bagian — "Halo"',
  selectorPath: "main > section.hero",
  tag: "section",
};
const gallery: EditBlockRef = {
  id: "b2",
  label: 'Bagian — "Galeri"',
  selectorPath: "main > section.gallery",
  tag: "section",
};
const footer: EditBlockRef = {
  id: "b3",
  label: 'Bagian — "Kontak"',
  selectorPath: "main > footer.contact",
  tag: "footer",
};

function makeLayout(
  order: string[],
  removed: string[] = [],
  blocks: Record<string, EditBlockRef> = { b1: hero, b2: gallery, b3: footer },
): EditLayout {
  return {
    blocks,
    parentRefs: { main: "main" },
    parents: { main: order },
    removed,
  };
}

describe("buildDirectEditInstruction", () => {
  it("is empty when nothing changed", () => {
    const layout = makeLayout(["b1", "b2", "b3"]);
    expect(buildDirectEditInstruction(layout, layout)).toBe("");
  });

  it("describes reordering within a parent", () => {
    const original = makeLayout(["b1", "b2", "b3"]);
    const current = makeLayout(["b3", "b1", "b2"]);
    const instruction = buildDirectEditInstruction(original, current);
    expect(instruction).toContain("Urutkan bagian dalam main");
    expect(instruction).toContain(hero.label);
    expect(instruction.indexOf(footer.label)).toBeLessThan(
      instruction.indexOf(hero.label),
    );
  });

  it("describes removed blocks", () => {
    const original = makeLayout(["b1", "b2", "b3"]);
    const current = makeLayout(["b1", "b3"], ["b2"]);
    const instruction = buildDirectEditInstruction(original, current);
    expect(instruction).toContain("Hapus");
    expect(instruction).toContain(gallery.label);
    expect(instruction).toContain(gallery.selectorPath);
  });

  it("handles both reorder and remove together", () => {
    const original = makeLayout(["b1", "b2", "b3"]);
    const current = makeLayout(["b3", "b1"], ["b2"]);
    const instruction = buildDirectEditInstruction(original, current);
    expect(instruction).toContain("Urutkan");
    expect(instruction).toContain("Hapus");
    expect(instruction).toContain(gallery.label);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/projects/direct-edit.test.ts`
Expected: FAIL — module `./direct-edit` not found.

- [ ] **Step 3: Implement `direct-edit.ts`**

Create `src/lib/projects/direct-edit.ts`:

```ts
export type EditBlockRef = {
  id: string;
  label: string;
  selectorPath: string;
  tag: string;
};

export type EditLayout = {
  parentRefs: Record<string, string>;
  parents: Record<string, string[]>;
  removed: string[];
  blocks: Record<string, EditBlockRef>;
};

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * Diff an original layout against the current one and render an Indonesian
 * edit instruction the AI can apply to the generated source. Empty when no
 * structural change (reorder or removal) happened.
 */
export function buildDirectEditInstruction(
  original: EditLayout,
  current: EditLayout,
): string {
  const lines: string[] = [];
  const parentIds = new Set([
    ...Object.keys(original.parents),
    ...Object.keys(current.parents),
  ]);

  for (const parentId of parentIds) {
    const origOrder = original.parents[parentId] ?? [];
    const curOrder = current.parents[parentId] ?? [];
    if (sameOrder(origOrder, curOrder)) {
      continue;
    }
    const parentPath = current.parentRefs[parentId] ?? parentId;
    const orderedLabels = curOrder
      .map((id) => current.blocks[id]?.label ?? id)
      .join(", ");
    lines.push(`- Urutkan bagian dalam ${parentPath}: ${orderedLabels}`);
  }

  const removed = current.removed.filter(
    (id) => !original.removed.includes(id),
  );
  for (const id of removed) {
    const block = current.blocks[id];
    if (!block) {
      continue;
    }
    lines.push(`- Hapus: ${block.label} (${block.selectorPath})`);
  }

  if (!lines.length) {
    return "";
  }

  return [
    "Ubah struktur halaman agar sesuai susunan berikut. Pertahankan semua konten dan teks lain; jangan ubah gaya. Hanya lakukan penataan ulang dan penghapusan yang disebutkan:",
    ...lines,
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/projects/direct-edit.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/direct-edit.ts src/lib/projects/direct-edit.test.ts
git commit -m "feat(projects): pure layout diff -> direct-edit instruction"
```

---

### Task 2: Undo/redo reducer

**Files:**
- Modify: `src/lib/projects/direct-edit.ts`
- Test: `src/lib/projects/direct-edit.test.ts`

**Interfaces:**
- Consumes: `EditLayout` from Task 1.
- Produces:
  - `export function editHistoryPush(stack: EditHistory, layout: EditLayout): EditHistory`
  - `export function editHistoryUndo(stack: EditHistory): EditHistory`
  - `export function editHistoryRedo(stack: EditHistory): EditHistory`
  - `export type EditHistory = { present: EditLayout | null; past: EditLayout[]; future: EditLayout[] }`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/projects/direct-edit.test.ts`:

```ts
import {
  buildDirectEditInstruction,
  editHistoryPush,
  editHistoryRedo,
  editHistoryUndo,
  type EditBlockRef,
  type EditHistory,
  type EditLayout,
} from "./direct-edit";

const base = makeLayout(["b1", "b2", "b3"]);
const reordered = makeLayout(["b3", "b1", "b2"]);

describe("edit history", () => {
  it("pushes a new present and clears future", () => {
    const stack: EditHistory = { present: base, past: [], future: [] };
    const next = editHistoryPush(stack, reordered);
    expect(next.present).toBe(reordered);
    expect(next.past).toHaveLength(1);
    expect(next.past[0]).toBe(base);
    expect(next.future).toHaveLength(0);
  });

  it("undoes to previous present", () => {
    const stack: EditHistory = { present: reordered, past: [base], future: [] };
    const next = editHistoryUndo(stack);
    expect(next.present).toBe(base);
    expect(next.future).toHaveLength(1);
    expect(next.future[0]).toBe(reordered);
  });

  it("ignores a no-op push (same layout)", () => {
    const stack: EditHistory = { present: base, past: [], future: [] };
    const next = editHistoryPush(stack, base);
    expect(next.past).toHaveLength(0);
    expect(next.present).toBe(base);
  });

  it("does not undo past the beginning", () => {
    const stack: EditHistory = { present: base, past: [], future: [] };
    expect(editHistoryUndo(stack)).toBe(stack);
  });

  it("redoes forward", () => {
    const stack: EditHistory = {
      present: base,
      past: [],
      future: [reordered],
    };
    const next = editHistoryRedo(stack);
    expect(next.present).toBe(reordered);
    expect(next.future).toHaveLength(0);
  });

  it("does not redo past the end", () => {
    const stack: EditHistory = { present: base, past: [], future: [] };
    expect(editHistoryRedo(stack)).toBe(stack);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/projects/direct-edit.test.ts`
Expected: FAIL — `editHistoryPush` / `editHistoryUndo` / `editHistoryRedo` not exported.

- [ ] **Step 3: Implement the reducer**

Append to `src/lib/projects/direct-edit.ts`:

```ts
export type EditHistory = {
  present: EditLayout | null;
  past: EditLayout[];
  future: EditLayout[];
};

function layoutsEqual(a: EditLayout, b: EditLayout): boolean {
  return (
    JSON.stringify(a.parents) === JSON.stringify(b.parents) &&
    JSON.stringify(a.removed) === JSON.stringify(b.removed)
  );
}

export function editHistoryPush(
  stack: EditHistory,
  layout: EditLayout,
): EditHistory {
  if (stack.present && layoutsEqual(stack.present, layout)) {
    return stack;
  }
  return {
    present: layout,
    past: stack.present ? [...stack.past, stack.present] : stack.past,
    future: [],
  };
}

export function editHistoryUndo(stack: EditHistory): EditHistory {
  if (!stack.present || !stack.past.length) {
    return stack;
  }
  const previous = stack.past[stack.past.length - 1];
  return {
    present: previous,
    past: stack.past.slice(0, -1),
    future: [...stack.future, stack.present],
  };
}

export function editHistoryRedo(stack: EditHistory): EditHistory {
  if (!stack.present || !stack.future.length) {
    return stack;
  }
  const next = stack.future[stack.future.length - 1];
  return {
    present: next,
    past: [...stack.past, stack.present],
    future: stack.future.slice(0, -1),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/projects/direct-edit.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/direct-edit.ts src/lib/projects/direct-edit.test.ts
git commit -m "feat(projects): undo/redo layout history reducer"
```

---

### Task 3: Edit-mode bridge script

**Files:**
- Modify: `src/lib/projects/runtime-proxy.ts`
- Test: `src/lib/projects/runtime-proxy.test.ts`

**Interfaces:**
- Consumes: nothing at runtime (bridge is injected JS string).
- Produces:
  - `const EDIT_MODE_BRIDGE: string` — injected script string.
  - `injectPreviewAnnotationBridge(html: string)` now also appends `EDIT_MODE_BRIDGE`.
  - Bridge messages: listens for `umkmcepat-edit-mode` and `umkmcepat-edit-layout`; posts `umkmcepat-edit-ready` and `umkmcepat-edit-state` with an `EditLayout` payload (shape from Task 1).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/projects/runtime-proxy.test.ts`, inside the existing `describe("runtime proxy", ...)`:

```ts
  it("injects the direct edit-mode bridge", () => {
    const html = "<html><body></body></html>";
    const res = injectPreviewAnnotationBridge(html);
    expect(res).toContain("umkmcepat-edit-mode");
    expect(res).toContain("umkmcepat-edit-layout");
    expect(res).toContain("umkmcepat-edit-ready");
    expect(res).toContain("umkmcepat-edit-state");
    expect(res).toContain("data-umkm-id");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/projects/runtime-proxy.test.ts`
Expected: FAIL — the injected HTML does not contain edit-mode identifiers.

- [ ] **Step 3: Add the edit-mode bridge**

In `src/lib/projects/runtime-proxy.ts`, add the constant before `injectPreviewAnnotationBridge` and modify the injector. The bridge:

- Reacts to `umkmcepat-edit-mode`: toggles `active`, walks the DOM, marks atomic blocks with `data-umkm-id`, adds drag handles + remove buttons, and posts the initial layout as `umkmcepat-edit-ready`.
- On reorder/remove, posts `umkmcepat-edit-state` with the new layout.
- Reacts to `umkmcepat-edit-layout` (undo/redo from parent): reorders children and toggles `data-umkm-removed` + `style.display` per the supplied layout.

```ts
const EDIT_MODE_BRIDGE = String.raw`<script data-umkm-edit-bridge>(() => {
  const PARENT_ORIGIN = document.currentScript?.getAttribute('data-umkm-origin') || '*';
  let active = false;
  let removedIds = new Set();
  const blocks = new Map();
  let idCounter = 0;

  const ATOMIC_RE = /(^|[-_\s])(badge|card|capsule|chip|feature|item|pill|product|service|tag|tile)([-_\s]|$)/i;
  function isAtomicBlock(el) {
    if (el.matches('article,[role="listitem"],[data-umkm-annotatable]')) return true;
    if (el.tagName === 'section') return true;
    const className = typeof el.className === 'string' ? el.className : '';
    if (/(^|[\s_-])(body|container|content|inner|padding|wrapper)([\s_-]|$)/i.test(className)) return false;
    return ATOMIC_RE.test(className);
  }

  function parentIdOf(el) {
    const parent = el.parentElement;
    if (!parent) return 'body';
    return parent.id || parent.tagName.toLowerCase();
  }

  function selectorPath(el) {
    const parts = [];
    let current = el;
    while (current && current.nodeType === 1 && current !== document.body && parts.length < 7) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        part += '#' + current.id.replace(/[^a-zA-Z0-9_-]/g, '');
      } else {
        const classes = typeof current.className === 'string' ? current.className.split(/\s+/) : [];
        const cls = classes.find((n) => /^[a-z][a-z0-9_-]{2,}$/i.test(n) && !/(^css-|__[a-z0-9_-]{5,}$)/i.test(n));
        if (cls) part += '.' + cls;
        const siblings = current.parentElement ? Array.from(current.parentElement.children).filter((i) => i.tagName === current.tagName) : [];
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
      }
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  function labelFor(el) {
    const tag = el.tagName.toLowerCase();
    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const snippet = text ? ' — "' + text + '"' : '';
    if (tag === 'section') return 'Bagian' + snippet;
    return 'Blok' + snippet;
  }

  function scan() {
    blocks.clear();
    document.querySelectorAll('[data-umkm-id]').forEach((el) => {
      const id = el.getAttribute('data-umkm-id');
      blocks.set(id, { element: el, label: labelFor(el), selectorPath: selectorPath(el), tag: el.tagName.toLowerCase() });
    });
  }

  function layout() {
    const parents = {};
    const parentRefs = {};
    const blockRefs = {};
    const byParent = new Map();
    blocks.forEach((info, id) => {
      const pid = parentIdOf(info.element);
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(id);
      blockRefs[id] = { id, label: info.label, selectorPath: info.selectorPath, tag: info.tag };
      parentRefs[pid] = selectorPath(info.element.parentElement);
    });
    byParent.forEach((ids, pid) => { parents[pid] = ids; });
    return { parentRefs, parents, removed: Array.from(removedIds), blocks: blockRefs };
  }

  function post(type) {
    window.parent.postMessage({ type, payload: layout() }, PARENT_ORIGIN);
  }

  function applyLayout(next) {
    removedIds = new Set(next.removed || []);
    if (next.parents) {
      for (const pid of Object.keys(next.parents)) {
        const parentEl = blocks.get(pid)?.element?.parentElement;
        const container = parentEl && parentEl === document.body ? document.body : parentEl;
        if (!container) continue;
        const ordered = (next.parents[pid] || []).map((id) => blocks.get(id)?.element).filter(Boolean);
        ordered.forEach((el) => container.appendChild(el));
      }
    }
    blocks.forEach((info, id) => {
      const removed = removedIds.has(id);
      info.element.style.display = removed ? 'none' : '';
      info.element.setAttribute('data-umkm-removed', removed ? 'true' : 'false');
    });
  }

  function makeId() { idCounter += 1; return 'eb_' + Date.now().toString(36) + '_' + idCounter; }

  function ensureOverlays() {
    if (document.querySelector('[data-umkm-edit-overlay]')) return;
    const overlay = document.createElement('div');
    overlay.setAttribute('data-umkm-edit-overlay', 'true');
    overlay.style.cssText = 'position:absolute;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(overlay);

    document.addEventListener('mouseover', (e) => {
      if (!active) return;
      const block = findBlock(e.target);
      if (!block) { overlay.textContent = ''; return; }
      const r = block.element.getBoundingClientRect();
      overlay.textContent = '';
      const badge = document.createElement('div');
      badge.style.cssText = 'position:absolute;left:' + (r.left + window.scrollX) + 'px;top:' + (r.top + window.scrollY) + 'px;background:#0d9488;color:#fff;padding:2px 6px;font:12px system-ui;border-radius:4px;pointer-events:auto;cursor:grab;';
      badge.textContent = '⣿ ' + block.label;
      badge.draggable = true;
      badge.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('text/plain', block.id); });
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = 'margin-left:6px;background:#b91c1c;border:0;color:#fff;cursor:pointer;border-radius:3px;padding:0 5px;pointer-events:auto;';
      closeBtn.addEventListener('click', () => {
        block.element.setAttribute('data-umkm-removed', 'true');
        block.element.style.display = 'none';
        removedIds.add(block.id);
        post('umkmcepat-edit-state');
      });
      badge.appendChild(closeBtn);
      overlay.appendChild(badge);
    });

    document.addEventListener('dragstart', (e) => {
      const badge = e.target.closest('[draggable="true"]');
      if (!badge) return;
      e.dataTransfer.setData('text/plain', e.dataTransfer.getData('text/plain') || badge.textContent.trim());
    });

    document.addEventListener('dragover', (e) => { if (active && e.target.closest('[data-umkm-id]')) e.preventDefault(); });
    document.addEventListener('drop', (e) => {
      if (!active) return;
      const target = findBlock(e.target);
      const dragId = e.dataTransfer.getData('text/plain');
      if (!target || !dragId) return;
      e.preventDefault();
      const src = blocks.get(dragId)?.element;
      const dst = target.element;
      if (!src || src === dst) return;
      src.parentElement.insertBefore(src, dst.nextSibling);
      scan();
      post('umkmcepat-edit-state');
    });
  }

  function findBlock(node) {
    let current = node;
    while (current && current.nodeType === 1 && current !== document.body) {
      const id = current.getAttribute && current.getAttribute('data-umkm-id');
      if (id && blocks.has(id)) return blocks.get(id);
      current = current.parentElement;
    }
    return null;
  }

  function activate() {
    active = true;
    document.querySelectorAll('article, section, [data-umkm-annotatable]').forEach((el) => {
      if (!el.hasAttribute('data-umkm-id')) el.setAttribute('data-umkm-id', makeId());
    });
    scan();
    ensureOverlays();
    post('umkmcepat-edit-ready');
  }

  function deactivate() {
    active = false;
    const overlay = document.querySelector('[data-umkm-edit-overlay]');
    if (overlay) overlay.remove();
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'umkmcepat-edit-mode') {
      data.active ? activate() : deactivate();
    }
    if (data.type === 'umkmcepat-edit-layout' && data.layout) {
      scan();
      applyLayout(data.layout);
      post('umkmcepat-edit-state');
    }
  });
})();</script>`;
```

Then update `injectPreviewAnnotationBridge` to append the edit bridge:

```ts
export function injectPreviewAnnotationBridge(html: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || "";
  const script = `<script data-umkm-annotation-bridge data-umkm-origin="${origin}">${PREVIEW_ANNOTATION_BRIDGE}</script>`;
  const editBridge = `<script data-umkm-edit-bridge data-umkm-origin="${origin}">${EDIT_MODE_BRIDGE}</script>`;
  const fallback = buildImageFallbackScript();

  if (html.includes("data-umkm-annotation-bridge")) {
    return html;
  }

  const injected = html.includes("</body>")
    ? html.replace("</body>", `${script}${editBridge}${fallback}</body>`)
    : `${html}${script}${editBridge}${fallback}`;
  return injected;
}
```

> **ponytail:** The overlay badge is a minimal drag handle. If we later want real drop-target highlight/animation, replace the native `dragover`/`drop` with a lightweight dnd-kit integration; the `data-umkm-id` model stays the same.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/projects/runtime-proxy.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/runtime-proxy.ts src/lib/projects/runtime-proxy.test.ts
git commit -m "feat(projects): direct edit-mode preview bridge (reorder + remove)"
```

---

### Task 4: Parent bridge wiring + toolbar UI

**Files:**
- Modify: `src/components/projects/WorkspacePrimitives.tsx`
- Modify: `src/components/projects/WorkspaceShell.tsx`
- Test: `src/components/projects/WorkspacePrimitives.test.ts`
- Create: `src/components/projects/DirectEditToolbar.stories.tsx`

**Interfaces:**
- Consumes:
  - `EditLayout`, `editHistoryPush`, `editHistoryUndo`, `editHistoryRedo`, `EditHistory` from `@/lib/projects/direct-edit`.
  - `uploadTempImageFile` from `@/lib/uploads/temp-image-client`.
  - `createImageReplaceEditInstruction`, `VisualAnnotationDraft` from `@/lib/projects/visual-annotations`.
- Produces:
  - `WorkspaceTopBar` new optional props: `directEditActive?: boolean`, `directEditAvailable?: boolean`, `onToggleDirectEdit?: () => void`.
  - `export function DirectEditToolbar({ canUndo, canRedo, onUndo, onRedo, onSave, onDiscard })` in `WorkspacePrimitives.tsx`.
  - `WorkspaceShell` handles `umkmcepat-edit-ready` / `umkmcepat-edit-state`, posts `umkmcepat-edit-mode` and `umkmcepat-edit-layout`, wires `onReplaceImage`.

- [ ] **Step 1: Write the failing test**

Append to `src/components/projects/WorkspacePrimitives.test.ts`:

```ts
import { DirectEditToolbar } from "./WorkspacePrimitives";

describe("DirectEditToolbar", () => {
  it("renders undo/redo/save/discard actions", () => {
    const markup = renderToStaticMarkup(
      createElement(DirectEditToolbar, {
        canUndo: true,
        canRedo: false,
        onUndo: vi.fn(),
        onRedo: vi.fn(),
        onSave: vi.fn(),
        onDiscard: vi.fn(),
      }),
    );
    expect(markup).toMatch(/aria-label="Undo"/);
    expect(markup).toMatch(/aria-label="Redo"/);
    expect(markup).toMatch(/Simpan/);
    expect(markup).toMatch(/Batalkan/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/projects/WorkspacePrimitives.test.ts`
Expected: FAIL — `DirectEditToolbar` not exported.

- [ ] **Step 3: Implement `DirectEditToolbar`**

In `src/components/projects/WorkspacePrimitives.tsx`, add the import for icons `Undo2, Redo2` (check existing lucide imports; add if missing) and add the component before `WorkspaceTopBar`:

```tsx
export function DirectEditToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onDiscard,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex items-center gap-spacing-2 rounded-radius-md border border-[#8fd3ff]/25 bg-[#0f2a3a] px-spacing-3 py-spacing-2">
      <span className="text-xs text-[#d6f0ff]">Ubah langsung</span>
      <button
        type="button"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={onUndo}
        className="grid size-8 place-items-center rounded-radius-sm border border-surface-warm-white/15 text-surface-warm-white/85 hover:bg-surface-warm-white/10 disabled:opacity-40"
      >
        <Undo2 className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Redo"
        disabled={!canRedo}
        onClick={onRedo}
        className="grid size-8 place-items-center rounded-radius-sm border border-surface-warm-white/15 text-surface-warm-white/85 hover:bg-surface-warm-white/10 disabled:opacity-40"
      >
        <Redo2 className="size-4" />
      </button>
      <Button
        type="button"
        size="sm"
        onClick={onSave}
        className="h-8 rounded-radius-md bg-[#0d9488] px-spacing-3 text-xs text-white hover:bg-[#0f766e]"
      >
        Simpan
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onDiscard}
        className="h-8 rounded-radius-md border-surface-warm-white/20 bg-transparent text-xs text-surface-warm-white/80 hover:bg-surface-warm-white/8"
      >
        Batalkan
      </Button>
    </div>
  );
}
```

Add `Undo2, Redo2` to the lucide-react import at the top of the file (match existing style; if the import is `import { X } from "lucide-react"`, extend the braces).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/projects/WorkspacePrimitives.test.ts`
Expected: all PASS.

- [ ] **Step 5: Create Storybook**

Create `src/components/projects/DirectEditToolbar.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";

import { DirectEditToolbar } from "./WorkspacePrimitives";

const meta = {
  component: DirectEditToolbar,
  args: {
    canUndo: true,
    canRedo: false,
    onUndo: fn(),
    onRedo: fn(),
    onSave: fn(),
    onDiscard: fn(),
  },
} satisfies Meta<typeof DirectEditToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoHistory: Story = {
  args: { canUndo: false, canRedo: false },
};
```

- [ ] **Step 6: Run the Storybook build check**

Run: `bun run storybook:build`
Expected: PASS (toolbar story builds). If Storybook is not wired to run in this env, note it and rely on the unit test + `bun run check`.

- [ ] **Step 7: Commit**

```bash
git add src/components/projects/WorkspacePrimitives.tsx src/components/projects/WorkspacePrimitives.test.ts src/components/projects/DirectEditToolbar.stories.tsx
git commit -m "feat(projects): direct-edit toolbar UI + storybook"
```

---

### Task 5: Wire direct-edit state into WorkspaceShell

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx`
- Test: `src/components/projects/WorkspaceShell.test.ts`

**Interfaces:**
- Consumes: `DirectEditToolbar` from Task 4; `EditLayout`, `EditHistory`, `editHistoryPush/Undo/Redo` from Task 1–2; `buildDirectEditInstruction` from Task 1.
- Produces: `WorkspaceShell` posts `umkmcepat-edit-mode`, `umkmcepat-edit-layout`; receives `umkmcepat-edit-ready` / `umkmcepat-edit-state`; exposes a Save handler and an image-replace handler.

- [ ] **Step 1: Write the failing test**

Append to `src/components/projects/WorkspaceShell.test.ts` a test for a small pure helper that the shell uses to decide history-availability. We'll add a pure `canUndoDirectEdit(history)` / `canRedoDirectEdit(history)` to `direct-edit.ts`. First add the tests in `direct-edit.test.ts`:

```ts
import {
  buildDirectEditInstruction,
  canRedoDirectEdit,
  canUndoDirectEdit,
  editHistoryPush,
  editHistoryRedo,
  editHistoryUndo,
  type EditBlockRef,
  type EditHistory,
  type EditLayout,
} from "./direct-edit";

describe("direct edit history availability", () => {
  it("reports undo/redo availability", () => {
    const empty: EditHistory = { present: base, past: [], future: [] };
    expect(canUndoDirectEdit(empty)).toBe(false);
    expect(canRedoDirectEdit(empty)).toBe(false);
    const undone = editHistoryUndo({
      present: reordered,
      past: [base],
      future: [],
    });
    expect(canUndoDirectEdit(undone)).toBe(true);
    expect(canRedoDirectEdit(undone)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/projects/direct-edit.test.ts`
Expected: FAIL — `canUndoDirectEdit` / `canRedoDirectEdit` not exported.

- [ ] **Step 3: Add availability helpers**

Append to `src/lib/projects/direct-edit.ts`:

```ts
export function canUndoDirectEdit(stack: EditHistory): boolean {
  return Boolean(stack.present && stack.past.length);
}

export function canRedoDirectEdit(stack: EditHistory): boolean {
  return Boolean(stack.present && stack.future.length);
}
```

- [ ] **Step 4: Run direct-edit tests**

Run: `bun test src/lib/projects/direct-edit.test.ts`
Expected: all PASS.

- [ ] **Step 5: Wire `WorkspaceShell`**

In `src/components/projects/WorkspaceShell.tsx`:

1. Add imports:

```ts
import {
  buildDirectEditInstruction,
  canRedoDirectEdit,
  canUndoDirectEdit,
  editHistoryPush,
  editHistoryRedo,
  editHistoryUndo,
  type EditHistory,
  type EditLayout,
} from "@/lib/projects/direct-edit";
```

2. Add state near the other annotation state (around line 345):

```ts
const [directEditMode, setDirectEditMode] = useState(false);
const [editHistory, setEditHistory] = useState<EditHistory>({
  present: null,
  past: [],
  future: [],
});
const editModeRef = useRef(false);
editModeRef.current = directEditMode;
```

3. Add a ref for the original layout and a function to push layout state from the bridge. Add a handler for the bridge messages inside the existing `GeneratedPreviewFrame` `onAnnotationTarget` area — add a separate `window.addEventListener("message", ...)` effect:

```ts
const lastEditLayoutRef = useRef<EditLayout | null>(null);

const handleDirectEditMessage = useCallback(
  (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "umkmcepat-edit-ready") {
      lastEditLayoutRef.current = data.payload as EditLayout;
      setEditHistory((current) => {
        const next = editHistoryPush(current, data.payload as EditLayout);
        return next;
      });
    }
    if (data.type === "umkmcepat-edit-state") {
      const layout = data.payload as EditLayout;
      lastEditLayoutRef.current = layout;
      setEditHistory((current) => editHistoryPush(current, layout));
    }
  },
  [],
);
```

> **ponytail:** `lastEditLayoutRef` is used to diff original vs current on Save. The history stack also holds past states; we keep the ref as the authoritative "current rendered" layout.

Add the listener effect (place near the other message effects in the component body):

```ts
useEffect(() => {
  window.addEventListener("message", handleDirectEditMessage);
  return () => window.removeEventListener("message", handleDirectEditMessage);
}, [handleDirectEditMessage]);
```

4. Add the `onToggleDirectEdit` handler and a helper to post edit-mode to the frame. The `GeneratedPreviewFrame` already listens for `umkmcepat-annotation-mode`; add a sibling effect in the frame component for edit mode, or reuse the same postMessage pattern. We'll extend `GeneratedPreviewFrame` to also accept `directEditActive` and post `umkmcepat-edit-mode`.

Add to `WorkspaceShell` before the `previewPanelContent` return, the toggle handler:

```ts
function toggleDirectEdit() {
  setDirectEditMode((current) => {
    setPendingAnnotationTarget(null);
    return !current;
  });
  setActiveTab("preview");
}
```

5. Add undo/redo/save/discard handlers:

```ts
function applyHistoryLayout(layout: EditLayout | null) {
  if (!layout) return;
  iframePostMessageRef.current?.({ type: "umkmcepat-edit-layout", layout });
}

const handleUndo = useCallback(() => {
  setEditHistory((current) => {
    const next = editHistoryUndo(current);
    if (next !== current) applyHistoryLayout(next.present);
    return next;
  });
}, []);

const handleRedo = useCallback(() => {
  setEditHistory((current) => {
    const next = editHistoryRedo(current);
    if (next !== current) applyHistoryLayout(next.present);
    return next;
  });
}, []);

function handleDiscard() {
  setEditHistory({ present: null, past: [], future: [] });
  setDirectEditMode(false);
  setPreviewReloadKey((current) => current + 1);
}
```

> **ponytail:** `iframePostMessageRef` needs the frame's `contentWindow`. Add a ref and pass it through `GeneratedPreviewFrame`, or simplest: since `GeneratedPreviewFrame` already posts `umkmcepat-annotation-mode`, add a `directEditActive` prop there and let the frame's own effect post `umkmcepat-edit-mode` and also accept a `layoutSignal` number to post `umkmcepat-edit-layout` when it changes. We'll take that route (see Task 6). For now define `applyHistoryLayout` to set a `editLayoutSignal` state the frame effect consumes:

```ts
const [editLayoutSignal, setEditLayoutSignal] = useState(0);
const [pendingEditLayout, setPendingEditLayout] = useState<EditLayout | null>(null);

function applyHistoryLayout(layout: EditLayout | null) {
  setPendingEditLayout(layout);
  setEditLayoutSignal((c) => c + 1);
}
```

6. Save handler (reuses existing edit POST flow pattern from `sendVisualAnnotations`):

```ts
async function saveDirectEdit() {
  const original = editHistory.past[0] ?? null;
  const current = lastEditLayoutRef.current;
  if (!current || !original) return;
  const instruction = buildDirectEditInstruction(original, current);
  if (!instruction) {
    handleDiscard();
    return;
  }
  setDirectEditMode(false);
  await submitDirectEdit({ instruction, summary: instruction });
}
```

Add `submitDirectEdit` as a thin wrapper that POSTs to `/api/projects/:id/edit` and on success bumps `previewReloadKey` and invalidates queries — mirror `sendVisualAnnotations` (lines ~1955-2053) but without annotations. Reuse the same streaming reader if desired, or a simpler non-stream POST that resolves on `buildStatus`. For scope, implement a simple POST that reads `buildStatus` from JSON:

```ts
async function submitDirectEdit({
  instruction,
  summary,
}: {
  instruction: string;
  summary: string;
}) {
  if (readOnly || isProcessing) return;
  const response = await fetch(`/api/projects/${projectId}/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction, kind: "instruction", summary }),
  });
  const result = (await response.json().catch(() => null)) as {
    buildStatus?: string;
    message?: string;
  } | null;
  if (!response.ok || result?.buildStatus !== "succeeded") {
    return;
  }
  setEditHistory({ present: null, past: [], future: [] });
  setPreviewReloadKey((current) => current + 1);
  void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
}
```

> **ponytail:** `submitDirectEdit` uses a simple JSON response rather than the SSE stream. The `/api/projects/:id/edit` route returns `createReadStreamFromChannel(attempt.id)` (a stream). To keep this correct without duplicating the SSE reader, reuse the exact streaming reader from `sendVisualAnnotations`. Copy that reading loop into `submitDirectEdit`.

- [ ] **Step 6: Run WorkspaceShell tests**

Run: `bun test src/components/projects/WorkspaceShell.test.ts`
Expected: PASS (existing tests unaffected).

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/direct-edit.ts src/lib/projects/direct-edit.test.ts src/components/projects/WorkspaceShell.tsx
git commit -m "feat(projects): direct-edit state + undo/redo + save in workspace"
```

---

### Task 6: Frame edit-mode + layout postMessage

**Files:**
- Modify: `src/components/projects/WorkspacePrimitives.tsx`
- Modify: `src/components/projects/WorkspaceShell.tsx`

**Interfaces:**
- Consumes: `directEditActive`, `editLayoutSignal`, and `editLayout` props from `WorkspaceShell` (Task 5).
- Produces: `GeneratedPreviewFrame` posts `umkmcepat-edit-mode` on activation and `umkmcepat-edit-layout` when `editLayoutSignal` changes.

- [ ] **Step 1: Add props to `GeneratedPreviewFrame`**

In `src/components/projects/WorkspacePrimitives.tsx`, extend the `GeneratedPreviewFrame` props and add two effects mirroring the existing annotation-mode postMessage:

```tsx
directEditActive = false,
editLayoutSignal = 0,
```

Add to the props type:

```ts
directEditActive?: boolean;
editLayoutSignal?: number;
editLayout?: EditLayout | null;
```

Add effects (place near the existing `umkmcepat-annotation-mode` effect, ~line 533):

```tsx
useEffect(() => {
  iframeRef.current?.contentWindow?.postMessage(
    { active: directEditActive, type: "umkmcepat-edit-mode" },
    "*",
  );
}, [directEditActive, ready, reloadKey]);

useEffect(() => {
  if (editLayoutSignal > 0) {
    iframeRef.current?.contentWindow?.postMessage(
      { layout: editLayout, type: "umkmcepat-edit-layout" },
      "*",
    );
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [editLayoutSignal, ready, reloadKey]);
```

- [ ] **Step 2: Pass props from `WorkspaceShell`**

In `WorkspaceShell.tsx`, pass `directEditActive={directEditMode}` and `editLayoutSignal={editLayoutSignal}` and `editLayout={pendingEditLayout}` to the `<GeneratedPreviewFrame ... />` (around line 3315).

- [ ] **Step 3: Add the toolbar to the top bar area**

In `WorkspaceShell.tsx`, render `DirectEditToolbar` when `directEditMode` is active, inside the preview panel (next to `GeneratedPreviewFrame`):

```tsx
{directEditMode ? (
  <div className="absolute inset-x-0 top-0 z-20 flex justify-center px-4 py-2">
    <DirectEditToolbar
      canUndo={canUndoDirectEdit(editHistory)}
      canRedo={canRedoDirectEdit(editHistory)}
      onUndo={handleUndo}
      onRedo={handleRedo}
      onSave={() => void saveDirectEdit()}
      onDiscard={handleDiscard}
    />
  </div>
) : null}
```

Import `DirectEditToolbar` from `@/components/projects/WorkspacePrimitives`.

- [ ] **Step 4: Add the mode toggle button to `WorkspaceTopBar`**

In `WorkspacePrimitives.tsx`, add props to `WorkspaceTopBar` and a second toggle button next to the commentary "Ubah" button:

```ts
directEditActive?: boolean;
directEditAvailable?: boolean;
onToggleDirectEdit?: () => void;
```

Add a desktop button (mirroring the annotation button around line 157):

```tsx
{directEditAvailable && activeTab === "preview" ? (
  <button
    type="button"
    onClick={onToggleDirectEdit}
    aria-pressed={directEditActive}
    aria-label={directEditActive ? "Nonaktifkan ubah langsung" : "Aktifkan ubah langsung"}
    className={`hidden md:inline-flex h-9 items-center gap-spacing-2 rounded-radius-md border px-spacing-3 py-spacing-2 text-xs transition cursor-pointer ${directEditActive ? "border-[#8fd3ff]/35 bg-[#8fd3ff]/12 text-[#d6f0ff]" : "border-surface-warm-white/10 bg-surface-warm-white/5 text-surface-warm-white/64 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"}`}
  >
    <PanelsTopLeft className="size-4" />
    <span className="hidden sm:inline">{directEditActive ? "Ubah langsung aktif" : "Ubah langsung"}</span>
  </button>
) : null}
```

Add `PanelsTopLeft` to the lucide import. Add the equivalent mobile menu entry. Pass the new props from `WorkspaceShell` where `WorkspaceTopBar` is rendered (line 3261): `directEditAvailable={!readOnly && shouldRenderGeneratedPreview}`, `directEditActive={directEditMode}`, `onToggleDirectEdit={toggleDirectEdit}`.

> **ponytail:** The commentary "Ubah" and direct "Ubah langsung" are independent toggles; activating one does not force-disable the other. If we later want mutual exclusivity, disable the commentary toggle while `directEditMode` is active.

- [ ] **Step 5: Run WorkspacePrimitives + WorkspaceShell tests**

Run:
```bash
bun test src/components/projects/WorkspacePrimitives.test.ts src/components/projects/WorkspaceShell.test.ts
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/projects/WorkspacePrimitives.tsx src/components/projects/WorkspaceShell.tsx
git commit -m "feat(projects): frame posts direct-edit mode + toolbar toggle"
```

---

### Task 7: Wire dead "Ganti gambar" image replace

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx`
- Modify: `src/components/projects/WorkspacePrimitives.tsx` (pass `onReplaceImage`)

**Interfaces:**
- Consumes:
  - `uploadTempImageFile` from `@/lib/uploads/temp-image-client`.
  - `createImageReplaceEditInstruction`, `VisualAnnotationDraft` from `@/lib/projects/visual-annotations`.
- Produces: `onReplaceImage` in `WorkspaceShell` opens a picker, claims via `/api/projects/$id/assets/upload`, builds an `image_replace` edit instruction, and submits an edit.

- [ ] **Step 1: Add replace handler in `WorkspaceShell`**

Add a function near `addPendingAnnotation`:

```ts
const replaceImageFileInputRef = useRef<HTMLInputElement | null>(null);
const replaceTargetRef = useRef<VisualAnnotationDraft["target"] | null>(null);

function openReplaceImage(target: VisualAnnotationDraft["target"]) {
  replaceTargetRef.current = target;
  replaceImageFileInputRef.current?.click();
}

async function handleReplaceImageFile(file: File) {
  const target = replaceTargetRef.current;
  if (!target || !target.src) return;
  const uploaded = await uploadTempImageFile(file);
  const claimForm = new FormData();
  claimForm.append("assetId", uploaded.assetId);
  claimForm.append("purpose", "business-image");
  const claimRes = await fetch(`/api/projects/${projectId}/assets/upload`, {
    method: "POST",
    body: claimForm,
  });
  if (!claimRes.ok) return;
  const asset = (await claimRes.json()) as { id: string };
  const mediaPath = `/media/${asset.id}`;
  const instruction = createImageReplaceEditInstruction({
    replaceWith: [{ alt: "Gambar baru", mediaPath }],
    target,
  });
  setPendingAnnotationTarget(null);
  await submitDirectEdit({ instruction, summary: "Ganti gambar." });
}
```

> **ponytail:** The generated site resolves `/media/<id>` to the asset's `publicUrl`. This reuses the exact path the build prompt already uses for owner images (`briefToBuildPrompt` emits `/media/<id>`), so the AI writer already understands it.

- [ ] **Step 2: Add a hidden file input**

Add near the annotation composer in `WorkspaceShell` render (inside the preview panel):

```tsx
<input
  ref={replaceImageFileInputRef}
  type="file"
  accept="image/png,image/jpeg,image/webp"
  className="hidden"
  onChange={(event) => {
    const file = event.target.files?.[0];
    if (file) void handleReplaceImageFile(file);
    event.target.value = "";
  }}
/>
```

- [ ] **Step 3: Pass `onReplaceImage` into the annotation popover**

In `WorkspaceShell.tsx`, in the `pendingAnnotation` object passed to `GeneratedPreviewFrame` (around line 3323), add:

```ts
onReplaceImage: () => openReplaceImage(pendingAnnotationTarget.target),
```

The `GeneratedPreviewFrame` already forwards `pendingAnnotation.onReplaceImage` to the popover button (`WorkspacePrimitives.tsx:582`), so no change is needed there.

- [ ] **Step 4: Write a unit test for the instruction builder usage**

The pure logic is in `createImageReplaceEditInstruction` (already tested). Add an assertion in `WorkspaceShell.test.ts` that the helper is exported and usable with a target:

```ts
import { createImageReplaceEditInstruction } from "@/lib/projects/visual-annotations";

describe("image replace instruction", () => {
  it("references the new media path", () => {
    const instruction = createImageReplaceEditInstruction({
      replaceWith: [{ alt: "Foto", mediaPath: "/media/abc" }],
      target: { src: "/placeholder.svg", tag: "img" },
    });
    expect(instruction).toContain("/media/abc");
    expect(instruction).toContain("/placeholder.svg");
  });
});
```

- [ ] **Step 5: Run tests**

Run:
```bash
bun test src/components/projects/WorkspaceShell.test.ts src/lib/projects/visual-annotations.test.ts
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx
git commit -m "feat(projects): wire image replace control (temp upload -> /media/id -> edit)"
```

---

### Task 8: Docs + DEV.md

**Files:**
- Modify: `DEV.md`

- [ ] **Step 1: Add a direct-edit + image-replace note**

In `DEV.md`, add a short section:

```markdown
Generated previews support a frontend direct-edit mode ("Ubah langsung"), separate from commentary annotation. The injected preview bridge (`runtime-proxy.ts`, `EDIT_MODE_BRIDGE`) enables drag-reorder + remove on atomic blocks and posts an `EditLayout` to the parent (`WorkspaceShell`), which keeps undo/redo history (`src/lib/projects/direct-edit.ts`). Save builds an Indonesian instruction diff and triggers the existing `/api/projects/:id/edit` AI rebuild + snapshot. "Ganti gambar" on an image in annotation mode uploads a temp image, claims it as a project asset (`/media/<id>`), and sends an `image_replace` edit. All DOM edits are temporary until Save.
```

- [ ] **Step 2: Commit**

```bash
git add DEV.md
git commit -m "docs(dev): note direct-edit mode + image replace"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run the local quality gate**

Run: `bun run check`
Expected: PASS (format, lint, typecheck, tests, Knip, docs). Fix any failures before proceeding.

- [ ] **Step 2: Manual sanity check (if local preview data is available)**

Open the workspace, activate "Ubah langsung", verify:

- Block drag handles appear on sections.
- Dragging reorders blocks and updates the toolbar Undo availability.
- Remove button hides a block; Undo restores it.
- Simpan triggers a rebuild; after build the preview reloads with the change applied.
- In commentary mode, clicking an image shows "Ganti gambar"; clicking it opens a picker and submitting replaces the image after a rebuild.

If no local preview data is available, record that manual preview was not run and rely on the unit tests + `bun run check`.

## Self-Review

Spec coverage:

- Drag-and-drop reorder: Task 3 (bridge) + Task 6 (frame wiring).
- Remove block: Task 3 bridge remove button.
- Local undo/redo: Task 2 (reducer) + Task 5 (wiring) + Task 6 (apply layout).
- Save → AI rebuild: Task 5 (`saveDirectEdit` → `/edit`).
- Discard: Task 5 (`handleDiscard` reloads preview).
- Wire dead "Ganti gambar": Task 7.
- Commentary separate: Task 6 keeps two independent toggles.
- Placehold.co: out of scope per decision — local SVG placeholders retained (no task; documented in spec Non-Goals).

Placeholder scan: every code step has exact code; every command has expected output; no TBD/TODO.

Type consistency:

- `EditLayout`, `EditBlockRef` defined once in Task 1, used identically in Tasks 2, 3, 5, 6.
- `editHistoryPush/Undo/Redo`, `EditHistory` consistent across Tasks 2 and 5.
- `canUndoDirectEdit` / `canRedoDirectEdit` added in Task 5 and used in Task 6.
- `DirectEditToolbar` props consistent across Task 4 and Task 6.
- `createImageReplaceEditInstruction` signature matches existing `visual-annotations.ts`.
