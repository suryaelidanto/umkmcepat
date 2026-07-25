import { describe, expect, it } from "vitest";

import {
  createImageReplaceEditInstruction,
  createVisualAnnotationEditInstruction,
  createVisualAnnotationSummary,
  sanitizeVisualAnnotations,
  type VisualAnnotationDraft,
} from "./visual-annotations";

const annotation: VisualAnnotationDraft = {
  id: "a1",
  label: 'Judul utama — "Servis motor"',
  comment: "Kecilkan sedikit dan bikin lebih premium.",
  selectedText: "Servis motor",
  target: {
    boundingBox: { height: 80, width: 320, x: 10, y: 20 },
    classes: "hero-title",
    nearbyText: "Bengkel terpercaya | Servis motor",
    selectorPath: "main > section.hero > h1",
    tag: "h1",
    text: "Servis motor",
  },
};

describe("visual annotations", () => {
  it("creates a user-facing summary", () => {
    expect(
      createVisualAnnotationSummary({
        annotations: [annotation],
        instruction: "Bikin keseluruhan lebih clean.",
      }),
    ).toContain("Aku kirim 1 komentar visual");
  });

  it("sanitizes malformed/oversized annotation payloads", () => {
    const sanitized = sanitizeVisualAnnotations([
      annotation,
      { id: "bad" },
      ...Array.from({ length: 25 }, (_, index) => ({
        ...annotation,
        id: `a${index}`,
      })),
    ]);

    expect(sanitized).toHaveLength(20);
    expect(sanitized[0]?.target.selectorPath).toBe("main > section.hero > h1");
  });

  it("creates an edit instruction with hidden target context", () => {
    const instruction = createVisualAnnotationEditInstruction({
      annotations: [annotation],
    });

    expect(instruction).toContain("Judul utama");
    expect(instruction).toContain("selectorPath");
    expect(instruction).toContain("main > section.hero > h1");
  });
});

describe("image-replace edit instruction", () => {
  it("carries the exact target.src + the replacement mediaPaths, never raw R2 URLs", () => {
    const instruction = createImageReplaceEditInstruction({
      replaceWith: [{ alt: "kue", mediaPath: "/media/a1" }],
      target: { src: "https://pub.r2.dev/x.png", tag: "img" },
    });
    expect(instruction).toContain('src="https://pub.r2.dev/x.png"');
    expect(instruction).toContain("/media/a1");
  });

  it("rejects a non-image target (no src)", () => {
    expect(() =>
      createImageReplaceEditInstruction({
        replaceWith: [{ alt: "x", mediaPath: "/media/a1" }],
        target: { tag: "div" },
      }),
    ).toThrow(/image/);
  });
});
