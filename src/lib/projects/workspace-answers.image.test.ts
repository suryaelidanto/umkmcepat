import { describe, expect, it } from "vitest";

import { type WorkspaceCard } from "./brief";
import { buildBriefPatchFromWorkspaceAnswers } from "./workspace-answers";

describe("buildBriefPatchFromWorkspaceAnswers (image_upload)", () => {
  it("writes businessImages from an image_upload answer's assetIds", () => {
    const card: WorkspaceCard = {
      type: "image_upload",
      imageUpload: {
        id: "img1",
        question: "Upload foto produk?",
        purpose: "business-image",
        selectionMode: "multiple",
      },
    };
    const patch = buildBriefPatchFromWorkspaceAnswers({
      card,
      fallbackText: "",
      workspaceAnswers: [
        {
          questionId: "img1",
          question: "Upload foto produk?",
          answer: "2 gambar diunggah",
          source: "custom",
          assetIds: ["a1", "a2"],
        },
      ],
    });
    expect(patch.businessImages).toEqual([
      { id: "a1", purpose: "business-image" },
      { id: "a2", purpose: "business-image" },
    ]);
  });
});
