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

export type DirectEditTargetRef = {
  label: string;
  selectorPath: string;
  tag: string;
  text?: string;
};

export type DirectEditIntent = {
  action: "remove" | "move-up" | "move-down" | "update-text" | "replace-image";
  newText?: string;
  newSrc?: string;
  target: DirectEditTargetRef;
};

export type DirectEditIntentHistory = {
  present: DirectEditIntent[];
  past: DirectEditIntent[][];
  future: DirectEditIntent[][];
};

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

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

export function buildDirectEditIntentInstruction(
  intents: DirectEditIntent[],
): string {
  if (!intents.length) {
    return "";
  }

  const lines = intents.map((intent) => {
    let action = "";
    if (intent.action === "remove") {
      action = "Hapus bagian/elemen ini";
    } else if (intent.action === "move-up") {
      action = "Pindahkan bagian/elemen ini ke atas";
    } else if (intent.action === "move-down") {
      action = "Pindahkan bagian/elemen ini ke bawah";
    } else if (intent.action === "update-text") {
      action = `Ganti teks menjadi "${intent.newText || ""}"`;
    } else if (intent.action === "replace-image") {
      action = `Ganti gambar menjadi "${intent.newSrc || ""}"`;
    }

    const text = intent.target.text
      ? `; teks sebelumnya: "${intent.target.text}"`
      : "";
    return `- ${action}: ${intent.target.label} (${intent.target.selectorPath}; tag: ${intent.target.tag}${text})`;
  });

  return [
    "Ubah halaman berdasarkan aksi yang dipilih user di preview. Cocokkan target memakai selector, tag, dan teks sekitar. Pertahankan konten dan gaya lain.",
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

export function intentHistoryPush(
  stack: DirectEditIntentHistory,
  intent: DirectEditIntent,
): DirectEditIntentHistory {
  return {
    present: [...stack.present, intent],
    past: [...stack.past, stack.present],
    future: [],
  };
}

export function intentHistoryUndo(
  stack: DirectEditIntentHistory,
): DirectEditIntentHistory {
  if (!stack.past.length) {
    return stack;
  }
  return {
    present: stack.past[stack.past.length - 1],
    past: stack.past.slice(0, -1),
    future: [stack.present, ...stack.future],
  };
}

export function intentHistoryRedo(
  stack: DirectEditIntentHistory,
): DirectEditIntentHistory {
  if (!stack.future.length) {
    return stack;
  }
  return {
    present: stack.future[0],
    past: [...stack.past, stack.present],
    future: stack.future.slice(1),
  };
}
