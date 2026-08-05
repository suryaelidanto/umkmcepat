import { describe, expect, it } from "vitest";

import { createImageUploadCard } from "./brief-flow";

describe("createImageUploadCard", () => {
  it("normalizes a valid image_upload card", () => {
    const card = createImageUploadCard({
      type: "image_upload",
      imageUpload: {
        id: "img1",
        question: "Upload foto produk?",
        selectionMode: "multiple",
        purpose: "business-image",
      },
    });
    expect(card).toEqual({
      type: "image_upload",
      imageUpload: {
        id: "img1",
        question: "Upload foto produk?",
        hint: undefined,
        selectionMode: "multiple",
        purpose: "business-image",
        required: false,
      },
    });
  });

  it("defaults selectionMode to single and required to false", () => {
    const card = createImageUploadCard({
      type: "image_upload",
      imageUpload: { id: "img2", question: "Logo?", purpose: "logo" },
    });
    expect(card?.imageUpload.selectionMode).toBe("single");
    expect(card?.imageUpload.required).toBe(false);
  });

  it("returns null for an invalid shape", () => {
    expect(
      createImageUploadCard({ type: "question", question: {} }),
    ).toBeNull();
    expect(createImageUploadCard(null)).toBeNull();
  });
});
