import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  readTempImageMock,
  claimTempImageMock,
  moderateProjectRequestMock,
  uploadProjectAssetMock,
} = vi.hoisted(() => ({
  readTempImageMock: vi.fn(),
  claimTempImageMock: vi.fn(),
  moderateProjectRequestMock: vi.fn(),
  uploadProjectAssetMock: vi.fn(),
}));

vi.mock("@/lib/storage/uploads/temp-image-storage", () => ({
  readTempImage: readTempImageMock,
  claimTempImage: claimTempImageMock,
}));

vi.mock("@/lib/ai/ai-moderation", () => ({
  getModerationTimeoutMs: () => 2500,
  moderateProjectRequest: moderateProjectRequestMock,
}));

vi.mock("@/lib/projects/project-asset-upload", () => ({
  uploadProjectAsset: uploadProjectAssetMock,
}));

import { prepareDiscussTurnAssets } from "./discuss-asset-phase";

import type { UIMessage } from "ai";

const TEMP_URL = (assetId: string) =>
  `/api/uploads/temp-images/${encodeURIComponent(assetId)}`;

function userMessage(parts: unknown[]): UIMessage {
  return { id: "u1", parts, role: "user" } as never as UIMessage;
}

function filePart(url: string): unknown {
  return { filename: "gambar.jpg", mediaType: "image/jpeg", type: "file", url };
}

describe("prepareDiscussTurnAssets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readTempImageMock.mockResolvedValue({
      body: Buffer.from("image-bytes"),
      contentType: "image/jpeg",
    });
    moderateProjectRequestMock.mockResolvedValue({
      allowed: true,
      modelId: "vision-model",
      usage: { inputTokens: 10, outputTokens: 1 },
    });
    claimTempImageMock.mockResolvedValue({
      body: Buffer.from("image-bytes"),
      contentType: "image/jpeg",
      sizeBytes: 11,
    });
    uploadProjectAssetMock.mockResolvedValue({ id: "asset_saved" });
  });

  it("returns messages untouched when no temp image parts exist", async () => {
    const messages = [userMessage([{ type: "text", text: "halo" }])];

    const result = await prepareDiscussTurnAssets({
      messages,
      projectId: "p1",
      turnId: "ct_1",
      userId: "u1",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.messages).toEqual(messages);
    expect(result.assetIds).toEqual([]);
    expect(result.imageCount).toBe(0);
    expect(readTempImageMock).not.toHaveBeenCalled();
    expect(moderateProjectRequestMock).not.toHaveBeenCalled();
    expect(claimTempImageMock).not.toHaveBeenCalled();
  });

  it("moderates first, claims after, and rewrites temp URLs to permanent media URLs", async () => {
    const order: string[] = [];
    moderateProjectRequestMock.mockImplementation(async () => {
      order.push("moderate");
      return {
        allowed: true,
        modelId: "vision-model",
        usage: { inputTokens: 10, outputTokens: 1 },
      };
    });
    claimTempImageMock.mockImplementation(async () => {
      order.push("claim");
      return {
        body: Buffer.from("image-bytes"),
        contentType: "image/jpeg",
        sizeBytes: 11,
      };
    });
    const messages = [
      userMessage([
        { type: "text", text: "1 gambar diunggah." },
        filePart(TEMP_URL("tok_1")),
      ]),
    ];

    const result = await prepareDiscussTurnAssets({
      messages,
      projectId: "p1",
      turnId: "ct_1",
      userId: "u1",
    });

    expect(order).toEqual(["moderate", "claim"]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.assetIds).toEqual(["asset_saved"]);
    expect(result.imageCount).toBe(1);
    expect(result.urlRewrites.get(TEMP_URL("tok_1"))).toBe(
      "/api/media/asset_saved",
    );
    const part = result.messages[0]!.parts[1] as { url: string };
    expect(part.url).toBe("/api/media/asset_saved");
    expect(uploadProjectAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bytes: Buffer.from("image-bytes"),
        projectId: "p1",
        purpose: "business-image",
        userId: "u1",
      }),
    );
    expect(moderateProjectRequestMock).toHaveBeenCalledWith(
      "",
      [expect.objectContaining({ bytes: Buffer.from("image-bytes") })],
      expect.any(Number),
      { projectId: "p1", turnId: "ct_1" },
    );
  });

  it("fails closed without claiming when an image is blocked", async () => {
    moderateProjectRequestMock.mockResolvedValue({
      allowed: false,
      message: "Gambar tidak memenuhi syarat.",
      modelId: "vision-model",
      usage: { inputTokens: 10, outputTokens: 1 },
    });
    const messages = [userMessage([filePart(TEMP_URL("tok_1"))])];

    const result = await prepareDiscussTurnAssets({
      messages,
      projectId: "p1",
      turnId: "ct_1",
      userId: "u1",
    });

    expect(result).toMatchObject({
      message: "Gambar tidak memenuhi syarat.",
      status: "blocked",
    });
    expect(claimTempImageMock).not.toHaveBeenCalled();
    expect(uploadProjectAssetMock).not.toHaveBeenCalled();
  });

  it("fails closed without claiming when image moderation is unavailable", async () => {
    moderateProjectRequestMock.mockRejectedValue(new Error("provider down"));
    const messages = [userMessage([filePart(TEMP_URL("tok_1"))])];

    const result = await prepareDiscussTurnAssets({
      messages,
      projectId: "p1",
      turnId: "ct_1",
      userId: "u1",
    });

    expect(result).toMatchObject({ status: "unavailable" });
    expect(claimTempImageMock).not.toHaveBeenCalled();
    expect(uploadProjectAssetMock).not.toHaveBeenCalled();
  });

  it("reports a stale temp image instead of silently dropping it", async () => {
    readTempImageMock.mockRejectedValue(new Error("Gambar tidak valid."));
    const messages = [userMessage([filePart(TEMP_URL("tok_dead"))])];

    const result = await prepareDiscussTurnAssets({
      messages,
      projectId: "p1",
      turnId: "ct_1",
      userId: "u1",
    });

    expect(result).toMatchObject({ status: "stale" });
    expect(moderateProjectRequestMock).not.toHaveBeenCalled();
    expect(claimTempImageMock).not.toHaveBeenCalled();
  });

  it("rewrites every part that references the same claimed asset", async () => {
    const messages = [
      userMessage([filePart(TEMP_URL("tok_1"))]),
      userMessage([filePart(TEMP_URL("tok_1")), filePart(TEMP_URL("tok_2"))]),
    ];
    uploadProjectAssetMock
      .mockResolvedValueOnce({ id: "asset_a" })
      .mockResolvedValueOnce({ id: "asset_b" });

    const result = await prepareDiscussTurnAssets({
      messages,
      projectId: "p1",
      turnId: "ct_1",
      userId: "u1",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.assetIds).toEqual(["asset_a", "asset_b"]);
    const first = result.messages[0]!.parts[0] as { url: string };
    const secondFirst = result.messages[1]!.parts[0] as { url: string };
    const secondSecond = result.messages[1]!.parts[1] as { url: string };
    expect(first.url).toBe("/api/media/asset_a");
    expect(secondFirst.url).toBe("/api/media/asset_a");
    expect(secondSecond.url).toBe("/api/media/asset_b");
    expect(claimTempImageMock).toHaveBeenCalledTimes(2);
    expect(moderateProjectRequestMock).toHaveBeenCalledTimes(2);
  });

  it("only processes the latest user message so stale history parts never block a turn", async () => {
    const messages = [
      userMessage([filePart(TEMP_URL("tok_old"))]),
      userMessage([{ type: "text", text: "sekarang" }]),
    ];

    const result = await prepareDiscussTurnAssets({
      messages,
      projectId: "p1",
      turnId: "ct_1",
      userId: "u1",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.messages).toEqual(messages);
    expect(readTempImageMock).not.toHaveBeenCalled();
  });

  it("counts permanent media parts toward the image total", async () => {
    const messages = [
      userMessage([filePart("/api/media/perm_1"), filePart("/media/perm_2")]),
    ];

    const result = await prepareDiscussTurnAssets({
      messages,
      projectId: "p1",
      turnId: "ct_1",
      userId: "u1",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.imageCount).toBe(2);
  });
});
