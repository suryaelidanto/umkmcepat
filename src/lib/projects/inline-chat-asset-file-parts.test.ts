import { beforeEach, describe, expect, it, vi } from "vitest";

import { inlineChatAssetFileParts } from "./inline-chat-asset-file-parts";

import type { UIMessage } from "ai";

const { readProjectAssetByIdMock } = vi.hoisted(() => ({
  readProjectAssetByIdMock: vi.fn(),
}));

vi.mock("@/lib/projects/project-asset-upload", () => ({
  readProjectAssetById: readProjectAssetByIdMock,
}));

function userMessage(url: string): UIMessage {
  return {
    id: "u1",
    role: "user",
    parts: [
      {
        filename: "warung.png",
        mediaType: "image/png",
        type: "file",
        url,
      },
      { type: "text", text: "ini usahaku" },
    ] as UIMessage["parts"],
  };
}

describe("inlineChatAssetFileParts", () => {
  beforeEach(() => {
    readProjectAssetByIdMock.mockReset();
  });
  it("replaces /media asset markers with data URLs before model conversion", async () => {
    readProjectAssetByIdMock.mockResolvedValue({
      body: Buffer.from("hello image"),
      contentType: "image/png",
    });

    const [message] = await inlineChatAssetFileParts([
      userMessage("/media/cms_asset_1"),
    ]);

    expect(readProjectAssetByIdMock).toHaveBeenCalledWith("cms_asset_1");
    expect(message.parts[0]).toMatchObject({
      filename: "warung.png",
      mediaType: "image/png",
      type: "file",
      url: `data:image/png;base64,${Buffer.from("hello image").toString("base64")}`,
    });
  });

  it("leaves non-project asset file URLs unchanged", async () => {
    const [message] = await inlineChatAssetFileParts([
      userMessage("https://example.com/a.png"),
    ]);

    expect(readProjectAssetByIdMock).not.toHaveBeenCalled();
    expect(message.parts[0]).toMatchObject({
      url: "https://example.com/a.png",
    });
  });
});
