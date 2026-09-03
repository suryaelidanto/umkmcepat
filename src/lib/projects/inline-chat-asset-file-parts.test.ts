import { beforeEach, describe, expect, it, vi } from "vitest";

import { inlineChatAssetFileParts } from "./inline-chat-asset-file-parts";

import type { UIMessage } from "ai";

import { signTempImageToken } from "@/lib/storage/uploads/temp-image-token";

const { readProjectAssetByIdMock, readTempImageMock } = vi.hoisted(() => ({
  readProjectAssetByIdMock: vi.fn(),
  readTempImageMock: vi.fn(),
}));

vi.mock("@/lib/projects/project-asset-upload", () => ({
  readProjectAssetById: readProjectAssetByIdMock,
}));

vi.mock("@/lib/storage/uploads/temp-image-storage", () => ({
  readTempImage: readTempImageMock,
}));

const owner = { projectId: "p1", userId: "u1" };

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
    readTempImageMock.mockReset();
  });

  it("replaces /media asset markers with data URLs before model conversion", async () => {
    readProjectAssetByIdMock.mockResolvedValue({
      body: Buffer.from("hello image"),
      contentType: "image/png",
      projectId: owner.projectId,
      userId: owner.userId,
    });

    const [message] = await inlineChatAssetFileParts(
      [userMessage("/media/cms_asset_1")],
      owner,
    );

    expect(readProjectAssetByIdMock).toHaveBeenCalledWith("cms_asset_1", owner);
    expect(message.parts[0]).toMatchObject({
      filename: "warung.png",
      mediaType: "image/png",
      type: "file",
      url: `data:image/png;base64,${Buffer.from("hello image").toString("base64")}`,
    });
  });

  it("drops a project asset owned by another project or user", async () => {
    readProjectAssetByIdMock.mockResolvedValue({
      body: Buffer.from("private image"),
      contentType: "image/png",
      projectId: "other-project",
      userId: "other-user",
    });

    const [message] = await inlineChatAssetFileParts(
      [userMessage("/media/cross-project-asset")],
      owner,
    );

    expect(readProjectAssetByIdMock).toHaveBeenCalledWith(
      "cross-project-asset",
      owner,
    );
    expect(message.parts).toHaveLength(1);
    expect(message.parts[0]).toMatchObject({
      text: "ini usahaku",
      type: "text",
    });
  });

  it("resolves a signed owner-bound temporary token to a data URL", async () => {
    readProjectAssetByIdMock.mockResolvedValue(null);
    readTempImageMock.mockResolvedValue({
      body: Buffer.from("temp image data"),
      contentType: "image/jpeg",
    });
    const payload = {
      contentType: "image/jpeg",
      expiresAt: Date.now() + 60_000,
      key: "temp-uploads/u1/123/image.jpg",
      sizeBytes: 15,
      userId: owner.userId,
    };
    const token = signTempImageToken(payload);

    const [message] = await inlineChatAssetFileParts(
      [userMessage(`/api/uploads/temp-images/${token}`)],
      owner,
    );

    expect(readTempImageMock).toHaveBeenCalledWith(owner.userId, token);
    expect(message.parts[0]).toMatchObject({
      mediaType: "image/jpeg",
      type: "file",
      url: `data:image/jpeg;base64,${Buffer.from("temp image data").toString("base64")}`,
    });
  });

  it("drops an unsigned temporary token without reading private storage", async () => {
    readProjectAssetByIdMock.mockResolvedValue(null);
    readTempImageMock.mockRejectedValue(new Error("Gambar tidak valid."));
    const payload = {
      contentType: "image/jpeg",
      key: "temp-uploads/u1/123/image.jpg",
    };
    const token = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.forged`;

    const [message] = await inlineChatAssetFileParts(
      [userMessage(`/api/uploads/temp-images/${token}`)],
      owner,
    );

    expect(readTempImageMock).toHaveBeenCalledWith(owner.userId, token);
    expect(message.parts).toHaveLength(1);
  });

  it("drops malformed encoded asset paths", async () => {
    const [message] = await inlineChatAssetFileParts(
      [userMessage("/media/%")],
      owner,
    );

    expect(message.parts).toHaveLength(1);
    expect(message.parts[0]).toMatchObject({
      text: "ini usahaku",
      type: "text",
    });
  });

  it("discards unresolvable relative URLs to prevent AI SDK crash", async () => {
    readProjectAssetByIdMock.mockResolvedValue(null);
    readTempImageMock.mockRejectedValue(new Error("Not found"));

    const [message] = await inlineChatAssetFileParts(
      [userMessage("/api/media/unknown_invalid_key")],
      owner,
    );

    // The invalid file part is stripped, leaving only the text part
    expect(message.parts.length).toBe(1);
    expect(message.parts[0]).toMatchObject({
      text: "ini usahaku",
      type: "text",
    });
  });

  it("leaves external https URLs unchanged", async () => {
    const [message] = await inlineChatAssetFileParts(
      [userMessage("https://example.com/a.png")],
      owner,
    );

    expect(readProjectAssetByIdMock).not.toHaveBeenCalled();
    expect(message.parts[0]).toMatchObject({
      url: "https://example.com/a.png",
    });
  });
});
