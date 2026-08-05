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

export function canUndoDirectEdit(stack: EditHistory): boolean {
  return Boolean(stack.present && stack.past.length);
}

export function canRedoDirectEdit(stack: EditHistory): boolean {
  return Boolean(stack.present && stack.future.length);
}
