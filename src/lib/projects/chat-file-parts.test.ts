import { describe, expect, it } from "vitest";

import { createUploadedImageFilePart } from "./chat-file-parts";

describe("createUploadedImageFilePart", () => {
  it("uses the uploaded asset URL instead of inlining image bytes", () => {
    const part = createUploadedImageFilePart({
      filename: "warung.png",
      mediaType: "image/png",
      publicUrl: "https://media.example/project-assets/p/u/a.png",
    });

    expect(part).toEqual({
      filename: "warung.png",
      mediaType: "image/png",
      type: "file",
      url: "https://media.example/project-assets/p/u/a.png",
    });
    expect(part.url).not.toMatch(/^data:/);
  });

  it("falls back to image/png when the browser omits a MIME type", () => {
    expect(
      createUploadedImageFilePart({
        filename: "warung",
        mediaType: "",
        publicUrl: "https://media.example/project-assets/p/u/a.png",
      }).mediaType,
    ).toBe("image/png");
  });
});
