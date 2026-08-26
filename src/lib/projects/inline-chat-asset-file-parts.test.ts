import { beforeEach, describe, expect, it, vi } from "vitest";

import { inlineChatAssetFileParts } from "./inline-chat-asset-file-parts";

import type { UIMessage } from "ai";

const { getS3ObjectMock, readProjectAssetByIdMock } = vi.hoisted(() => ({
  getS3ObjectMock: vi.fn(),
  readProjectAssetByIdMock: vi.fn(),
}));

vi.mock("@/lib/projects/project-asset-upload", () => ({
  readProjectAssetById: readProjectAssetByIdMock,
}));

vi.mock("@/lib/storage/s3-client", () => ({
  getS3Object: getS3ObjectMock,
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
    getS3ObjectMock.mockReset();
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

  it("resolves temporary S3 tokens to data URLs", async () => {
    readProjectAssetByIdMock.mockResolvedValue(null);
    getS3ObjectMock.mockResolvedValue(Buffer.from("temp image data"));

    const payload = {
      contentType: "image/jpeg",
      key: "temp-uploads/user1/123/img.jpg",
    };
    const token = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

    const [message] = await inlineChatAssetFileParts([
      userMessage(`/api/media/${token}`),
    ]);

    expect(getS3ObjectMock).toHaveBeenCalledWith("private", payload.key);
    expect(message.parts[0]).toMatchObject({
      mediaType: "image/jpeg",
      type: "file",
      url: `data:image/jpeg;base64,${Buffer.from("temp image data").toString("base64")}`,
    });
  });

  it("discards unresolvable relative URLs to prevent AI SDK crash", async () => {
    readProjectAssetByIdMock.mockResolvedValue(null);
    getS3ObjectMock.mockRejectedValue(new Error("Not found"));

    const [message] = await inlineChatAssetFileParts([
      userMessage("/api/media/unknown_invalid_key"),
    ]);

    // The invalid file part is stripped, leaving only the text part
    expect(message.parts.length).toBe(1);
    expect(message.parts[0]).toMatchObject({
      text: "ini usahaku",
      type: "text",
    });
  });

  it("leaves external https URLs unchanged", async () => {
    const [message] = await inlineChatAssetFileParts([
      userMessage("https://example.com/a.png"),
    ]);

    expect(readProjectAssetByIdMock).not.toHaveBeenCalled();
    expect(message.parts[0]).toMatchObject({
      url: "https://example.com/a.png",
    });
  });
});
