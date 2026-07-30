import { describe, expect, it } from "vitest";

import { createUploadedImageFilePart } from "./chat-file-parts";

describe("createUploadedImageFilePart", () => {
  it("uses the uploaded asset marker instead of inlining image bytes", () => {
    const part = createUploadedImageFilePart({
      filename: "warung.png",
      mediaType: "image/png",
      url: "/media/cms_asset_1",
    });

    expect(part).toEqual({
      filename: "warung.png",
      mediaType: "image/png",
      type: "file",
      url: "/media/cms_asset_1",
    });
    expect(part.url).not.toMatch(/^data:/);
  });

  it("falls back to image/png when the browser omits a MIME type", () => {
    expect(
      createUploadedImageFilePart({
        filename: "warung",
        mediaType: "",
        url: "/media/cms_asset_1",
      }).mediaType,
    ).toBe("image/png");
  });
});
