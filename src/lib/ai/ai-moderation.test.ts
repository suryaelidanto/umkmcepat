import { readFileSync } from "node:fs";

import { generateText } from "ai";
import { describe, expect, it, vi, type Mock } from "vitest";

const { recordAiCallMock } = vi.hoisted(() => ({
  recordAiCallMock: vi.fn(),
}));

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/ai-call-record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/ai-call-record")>()),
  recordAiCall: recordAiCallMock,
}));
vi.mock("@/lib/ai/ai", () => ({
  getAiModel: vi.fn(() => "test/model"),
  getAiTelemetry: vi.fn(() => ({ isEnabled: false })),
}));
vi.mock("@/lib/ai/ai-models", () => ({
  DEFAULT_AI_MODEL: "default-combo",
  getDefaultAiModel: vi.fn(() => "default-combo"),
  getModerationModel: vi.fn(() => "default-combo"),
  getDiscussModel: vi.fn(() => "default-combo"),
  getGenerationModel: vi.fn(() => "default-combo"),
}));

const generateTextMock = generateText as Mock;

import { moderateProjectRequest } from "./ai-moderation";

describe("moderateProjectRequest", () => {
  it("allows ALLOW responses", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: "ALLOW",
      usage: { inputTokens: 10, outputTokens: 1 },
    } as never);

    await expect(moderateProjectRequest("jual kopi")).resolves.toEqual({
      allowed: true,
      modelId: "default-combo",
      usage: { inputTokens: 10, outputTokens: 1 },
    });
  });

  it("blocks BLOCK responses", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: "BLOCK",
      usage: { inputTokens: 8, outputTokens: 1 },
    } as never);

    await expect(moderateProjectRequest("bad")).resolves.toMatchObject({
      allowed: false,
      modelId: "default-combo",
      usage: { inputTokens: 8, outputTokens: 1 },
    });
  });

  it("defaults to ALLOW for empty/unexpected model responses", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: "",
      usage: { inputTokens: 5, outputTokens: 0 },
    } as never);

    await expect(moderateProjectRequest("jual teh kosong")).resolves.toEqual({
      allowed: true,
      modelId: "default-combo",
      usage: { inputTokens: 5, outputTokens: 0 },
    });
  });

  it("retries once on error and succeeds", async () => {
    generateTextMock.mockRejectedValueOnce(new Error("transient check error"));
    generateTextMock.mockResolvedValueOnce({
      text: "ALLOW",
      usage: { inputTokens: 12, outputTokens: 2 },
    } as never);

    await expect(moderateProjectRequest("jual teh retry")).resolves.toEqual({
      allowed: true,
      modelId: "default-combo",
      usage: { inputTokens: 12, outputTokens: 2 },
    });
  });

  it("throws provider errors after retrying once", async () => {
    generateTextMock.mockRejectedValueOnce(new Error("provider down"));
    generateTextMock.mockRejectedValueOnce(new Error("provider down"));

    await expect(
      moderateProjectRequest("jual teh provider down"),
    ).rejects.toThrow("provider down");
  });

  it("records a failed call row with caller correlation ids", async () => {
    recordAiCallMock.mockClear();
    generateTextMock.mockRejectedValueOnce(new Error("provider down"));
    generateTextMock.mockRejectedValueOnce(new Error("provider down"));

    await expect(
      moderateProjectRequest("jual teh ledger", [], undefined, {
        projectId: "prj-1",
      }),
    ).rejects.toThrow("provider down");

    expect(recordAiCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "prj-1",
        status: "error",
        task: "moderation",
      }),
    );
  });

  it("times out", async () => {
    generateTextMock.mockReturnValue(new Promise(() => undefined) as never);

    await expect(
      moderateProjectRequest("jual teh timeout", [], 1),
    ).rejects.toThrow("AI moderation timed out");
  });

  it("passes image content when provided", async () => {
    generateTextMock.mockClear();
    generateTextMock.mockResolvedValueOnce({
      text: "ALLOW",
      usage: { inputTokens: 20, outputTokens: 1 },
    } as never);

    const imageBytes = Buffer.from("fake-image");
    await moderateProjectRequest("jual baju", [
      { bytes: imageBytes, mediaType: "image/png" },
    ]);

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const callArgs = generateTextMock.mock.calls[0][0];
    expect(callArgs.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "jual baju" },
          { type: "image", image: imageBytes, mimeType: "image/png" },
        ],
      },
    ]);
  });

  it("skips cache hit and cache write when images are present", async () => {
    generateTextMock.mockClear();

    // First call with prompt "kopi" and no images -> returns BLOCK, gets cached
    generateTextMock.mockResolvedValueOnce({
      text: "BLOCK",
      usage: { inputTokens: 5, outputTokens: 1 },
    } as never);

    await expect(moderateProjectRequest("kopi")).resolves.toMatchObject({
      allowed: false,
    });
    expect(generateTextMock).toHaveBeenCalledTimes(1);

    // Call with prompt "kopi" and an image -> returns ALLOW, skips cache and calls API again
    generateTextMock.mockClear();
    generateTextMock.mockResolvedValueOnce({
      text: "ALLOW",
      usage: { inputTokens: 10, outputTokens: 1 },
    } as never);

    const imageBytes = Buffer.from("test-image-1");
    await expect(
      moderateProjectRequest("kopi", [
        { bytes: imageBytes, mediaType: "image/png" },
      ]),
    ).resolves.toMatchObject({
      allowed: true,
    });
    expect(generateTextMock).toHaveBeenCalledTimes(1);

    // Call again with prompt "kopi" and no images -> should still resolve to cached BLOCK without calling API
    generateTextMock.mockClear();
    await expect(moderateProjectRequest("kopi")).resolves.toMatchObject({
      allowed: false,
    });
    expect(generateTextMock).not.toHaveBeenCalled();

    // Call again with prompt "kopi" and an image -> should skip cache, call API, and resolve to ALLOW
    generateTextMock.mockClear();
    generateTextMock.mockResolvedValueOnce({
      text: "ALLOW",
      usage: { inputTokens: 10, outputTokens: 1 },
    } as never);

    await expect(
      moderateProjectRequest("kopi", [
        { bytes: imageBytes, mediaType: "image/png" },
      ]),
    ).resolves.toMatchObject({
      allowed: true,
    });
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });
});

describe("moderation prompt", () => {
  it("tells the checker it is screening replies, not standalone requests", () => {
    // "ya", "iya" and "boleh" were all refused as CLARIFY because the checker
    const source = readFileSync(
      new URL("./ai-moderation.ts", import.meta.url),
      "utf8",
    );

    expect(source).toMatch(/ongoing conversation/i);
    // Binary by design: CLARIFY was a refusal wearing softer copy, and the
    expect(source).toMatch(/exactly ALLOW or BLOCK/);
    expect(source).not.toMatch(/CLARIFY/);
    expect(source).not.toMatch(/checker keamanan lagi lambat/i);
  });
});
