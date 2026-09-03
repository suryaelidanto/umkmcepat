import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  readTempImageMock,
  claimTempImageMock,
  deleteTempImageMock,
  moderateProjectRequestMock,
  chargeModerationEnergyMock,
  uploadProjectAssetMock,
} = vi.hoisted(() => ({
  readTempImageMock: vi.fn(),
  claimTempImageMock: vi.fn(),
  deleteTempImageMock: vi.fn(),
  moderateProjectRequestMock: vi.fn(),
  chargeModerationEnergyMock: vi.fn(async () => undefined),
  uploadProjectAssetMock: vi.fn(),
}));

vi.mock("@/lib/storage/uploads/temp-image-storage", () => ({
  readTempImage: readTempImageMock,
  claimTempImage: claimTempImageMock,
  deleteTempImage: deleteTempImageMock,
}));

vi.mock("@/lib/ai/ai-moderation", () => ({
  chargeModerationEnergy: chargeModerationEnergyMock,
  getModerationTimeoutMs: () => 2500,
  moderateProjectRequest: moderateProjectRequestMock,
}));

vi.mock("@/lib/projects/project-asset-upload", () => ({
  uploadProjectAsset: uploadProjectAssetMock,
}));

import {
  attachPersistedProjectAssets,
  prepareDiscussTurnAssets,
} from "./discuss-asset-phase";

import type { UIMessage } from "ai";

const TEMP_URL = (assetId: string) =>
  `/api/uploads/temp-images/${encodeURIComponent(assetId)}`;

function userMessage(parts: unknown[]): UIMessage {
  return { id: "u1", parts, role: "user" } as never as UIMessage;
}

function filePart(url: string): unknown {
  return { filename: "gambar.jpg", mediaType: "image/jpeg", type: "file", url };
}

describe("attachPersistedProjectAssets", () => {
  it("adds stored business images to the first user message without duplicating media parts", () => {
    const messages = [
      userMessage([{ type: "text", text: "buat website laundry" }]),
      {
        id: "a1",
        parts: [{ type: "text", text: "Siap" }],
        role: "assistant",
      } as UIMessage,
    ];

    const result = attachPersistedProjectAssets(messages, [
      { contentType: "image/webp", id: "asset_new" },
      { contentType: "image/png", id: "asset_existing" },
    ]);
    const firstParts = result[0]!.parts;

    expect(firstParts).toEqual([
      { type: "text", text: "buat website laundry" },
      {
        type: "file",
        url: "/api/media/asset_new",
        mediaType: "image/webp",
      },
      {
        type: "file",
        url: "/api/media/asset_existing",
        mediaType: "image/png",
      },
    ]);
    expect(result[1]).toEqual(messages[1]);

    const withExisting = attachPersistedProjectAssets(
      [
        userMessage([
          { type: "text", text: "buat website laundry" },
          {
            type: "file",
            url: "/api/media/asset_existing",
            mediaType: "image/png",
          },
        ]),
      ],
      [{ contentType: "image/png", id: "asset_existing" }],
    );
    expect(withExisting[0]!.parts).toHaveLength(2);
  });
});

describe("prepareDiscussTurnAssets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chargeModerationEnergyMock.mockImplementation(async () => undefined);
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

  it("moderates first, saves after, and rewrites temp URLs to permanent media URLs", async () => {
    const order: string[] = [];
    moderateProjectRequestMock.mockImplementation(async () => {
      order.push("moderate");
      return {
        allowed: true,
        modelId: "vision-model",
        usage: { inputTokens: 10, outputTokens: 1 },
      };
    });
    uploadProjectAssetMock.mockImplementation(async () => {
      order.push("save");
      return { id: "asset_saved" };
    });
    deleteTempImageMock.mockImplementation(async () => {
      order.push("cleanup");
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

    expect(order).toEqual(["moderate", "save"]);
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
        sourceTempAssetId: "tok_1",
        userId: "u1",
      }),
    );
    expect(deleteTempImageMock).not.toHaveBeenCalled();
    expect(moderateProjectRequestMock).toHaveBeenCalledWith(
      "",
      [expect.objectContaining({ bytes: Buffer.from("image-bytes") })],
      expect.any(Number),
      { projectId: "p1", turnId: "ct_1" },
    );
    expect(chargeModerationEnergyMock).toHaveBeenCalledWith(
      "u1",
      {
        allowed: true,
        modelId: "vision-model",
        usage: { inputTokens: 10, outputTokens: 1 },
      },
      { projectId: "p1" },
    );
  });

  it("does not consume a temp image before its project asset is saved", async () => {
    uploadProjectAssetMock.mockRejectedValue(
      new Error("asset store unavailable"),
    );
    const messages = [userMessage([filePart(TEMP_URL("tok_1"))])];

    const result = await prepareDiscussTurnAssets({
      messages,
      projectId: "p1",
      turnId: "ct_1",
      userId: "u1",
    });

    expect(result.status).toBe("unavailable");
    expect(claimTempImageMock).not.toHaveBeenCalled();
    expect(deleteTempImageMock).not.toHaveBeenCalled();
  });

  it("keeps successful promotions visible when a later image save fails", async () => {
    uploadProjectAssetMock
      .mockResolvedValueOnce({ id: "asset_a" })
      .mockRejectedValueOnce(new Error("asset store unavailable"));
    const messages = [
      userMessage([filePart(TEMP_URL("tok_1")), filePart(TEMP_URL("tok_2"))]),
    ];

    const result = await prepareDiscussTurnAssets({
      messages,
      projectId: "p1",
      turnId: "ct_1",
      userId: "u1",
    });

    expect(result).toMatchObject({
      assetIds: ["asset_a"],
      status: "unavailable",
    });
    if (result.status !== "unavailable") {
      return;
    }
    expect(result.messages?.[0]?.parts).toEqual([
      filePart("/api/media/asset_a"),
      filePart(TEMP_URL("tok_2")),
    ]);
    expect(result.urlRewrites?.get(TEMP_URL("tok_1"))).toBe(
      "/api/media/asset_a",
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
    expect(deleteTempImageMock).not.toHaveBeenCalled();
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
