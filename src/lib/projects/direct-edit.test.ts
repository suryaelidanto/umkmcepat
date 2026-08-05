import { describe, expect, it } from "vitest";

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

const base = makeLayout(["b1", "b2", "b3"]);
const reordered = makeLayout(["b3", "b1", "b2"]);

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
    // After one undo: present=base, past empty, future=[reordered].
    expect(canUndoDirectEdit(undone)).toBe(false);
    expect(canRedoDirectEdit(undone)).toBe(true);
  });
});
