export type VisualAnnotationTarget = {
  boundingBox: { height: number; width: number; x: number; y: number };
  classes?: string;
  nearbyText?: string;
  selectorPath: string;
  tag: string;
  text: string;
};

export type VisualAnnotationDraft = {
  id: string;
  comment: string;
  label: string;
  selectedText?: string;
  target: VisualAnnotationTarget;
};

export const MAX_VISUAL_ANNOTATIONS = 20;
export const MAX_VISUAL_ANNOTATION_COMMENT = 1000;

export function createVisualAnnotationSummary({
  annotations,
  instruction,
}: {
  annotations: VisualAnnotationDraft[];
  instruction?: string;
}) {
  const lines = [
    `Aku kirim ${annotations.length} komentar visual untuk direvisi:`,
    ...annotations.map(
      (annotation, index) =>
        `${index + 1}. ${annotation.label}: ${annotation.comment}`,
    ),
  ];
  const trimmedInstruction = instruction?.trim();

  if (trimmedInstruction) {
    lines.push(`Arahan tambahan: ${trimmedInstruction}`);
  }

  return lines.join("\n");
}

export function createVisualAnnotationEditInstruction({
  annotations,
  instruction,
}: {
  annotations: VisualAnnotationDraft[];
  instruction?: string;
}) {
  const safeAnnotations = sanitizeVisualAnnotations(annotations).map(
    (item) => ({
      comment: trim(item.comment, MAX_VISUAL_ANNOTATION_COMMENT),
      label: trim(item.label, 160),
      selectedText: item.selectedText
        ? trim(item.selectedText, 500)
        : undefined,
      target: {
        ...item.target,
        classes: item.target.classes
          ? trim(item.target.classes, 300)
          : undefined,
        nearbyText: item.target.nearbyText
          ? trim(item.target.nearbyText, 500)
          : undefined,
        selectorPath: trim(item.target.selectorPath, 300),
        text: trim(item.target.text, 300),
      },
    }),
  );

  return [
    "Apply these visual comments to the generated website source.",
    "Use the labels for user intent and the target data to find the relevant JSX/CSS/content. Do not mention CSS selectors to the user.",
    instruction?.trim()
      ? `General instruction: ${trim(instruction, 1000)}`
      : "",
    "Visual comments:",
    JSON.stringify(safeAnnotations, null, 2),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function sanitizeVisualAnnotations(input: unknown) {
  if (!Array.isArray(input)) {
    return [] satisfies VisualAnnotationDraft[];
  }

  return input
    .flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const value = item as Partial<VisualAnnotationDraft>;
      const target = value.target as
        Partial<VisualAnnotationTarget> | undefined;
      const box = target?.boundingBox;

      if (
        !value.label ||
        !value.comment ||
        !target?.selectorPath ||
        !target.tag ||
        !box ||
        typeof box.x !== "number" ||
        typeof box.y !== "number" ||
        typeof box.width !== "number" ||
        typeof box.height !== "number"
      ) {
        return [];
      }

      return [
        {
          comment: trim(String(value.comment), MAX_VISUAL_ANNOTATION_COMMENT),
          id: value.id
            ? trim(String(value.id), 80)
            : createVisualAnnotationId(),
          label: trim(String(value.label), 160),
          selectedText: value.selectedText
            ? trim(String(value.selectedText), 500)
            : undefined,
          target: {
            boundingBox: {
              height: finiteNumber(box.height),
              width: finiteNumber(box.width),
              x: finiteNumber(box.x),
              y: finiteNumber(box.y),
            },
            classes: target.classes
              ? trim(String(target.classes), 300)
              : undefined,
            nearbyText: target.nearbyText
              ? trim(String(target.nearbyText), 500)
              : undefined,
            selectorPath: trim(String(target.selectorPath), 300),
            tag: trim(String(target.tag), 40).toLowerCase(),
            text: target.text ? trim(String(target.text), 300) : "",
          },
        },
      ];
    })
    .slice(0, MAX_VISUAL_ANNOTATIONS);
}

export function createVisualAnnotationId() {
  return `va_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function finiteNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function trim(value: string, max: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > max ? normalized.slice(0, max).trim() : normalized;
}
