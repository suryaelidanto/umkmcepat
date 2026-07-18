import { generateText } from "ai";
import { describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai", () => ({
  getAiModel: vi.fn(() => "test/model"),
  getAiTelemetry: vi.fn(() => ({ isEnabled: false })),
}));
vi.mock("@/lib/ai-models", () => ({
  DEFAULT_AI_MODEL: "umkmcepat-combo",
  getDefaultAiModel: vi.fn(() => "umkmcepat-combo"),
}));

const generateTextMock = vi.mocked(generateText);

import { moderateProjectRequest } from "./ai-moderation";

describe("moderateProjectRequest", () => {
  it("allows ALLOW responses", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: "ALLOW",
      usage: { inputTokens: 10, outputTokens: 1 },
    } as never);

    await expect(moderateProjectRequest("jual kopi")).resolves.toEqual({
      allowed: true,
      modelId: "umkmcepat-combo",
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
      modelId: "umkmcepat-combo",
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
      modelId: "umkmcepat-combo",
      usage: { inputTokens: 5, outputTokens: 0 },
    });
  });

  it("throws provider errors", async () => {
    generateTextMock.mockRejectedValueOnce(new Error("provider down"));

    await expect(
      moderateProjectRequest("jual teh provider down"),
    ).rejects.toThrow("provider down");
  });

  it("times out", async () => {
    generateTextMock.mockReturnValueOnce(new Promise(() => undefined) as never);

    await expect(moderateProjectRequest("jual teh timeout", 1)).rejects.toThrow(
      "AI moderation timed out",
    );
  });
});
