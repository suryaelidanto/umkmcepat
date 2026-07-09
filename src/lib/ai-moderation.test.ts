import { generateText } from "ai";
import { describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai", () => ({
  getAiModel: vi.fn(() => "test/model"),
  getAiTelemetry: vi.fn(() => ({ isEnabled: false })),
}));

const generateTextMock = vi.mocked(generateText);

import { moderateProjectRequest } from "./ai-moderation";
import { getAiTimeoutMs } from "./ai-timeouts";

describe("moderateProjectRequest", () => {
  it("allows ALLOW responses", async () => {
    generateTextMock.mockResolvedValueOnce({ text: "ALLOW" } as never);

    await expect(moderateProjectRequest("jual kopi")).resolves.toEqual({
      allowed: true,
    });
  });

  it("blocks non-ALLOW responses", async () => {
    generateTextMock.mockResolvedValueOnce({ text: "BLOCK" } as never);

    await expect(moderateProjectRequest("bad")).resolves.toMatchObject({
      allowed: false,
    });
  });

  it("throws provider errors", async () => {
    generateTextMock.mockRejectedValueOnce(new Error("provider down"));

    await expect(
      moderateProjectRequest("jual teh provider down"),
    ).rejects.toThrow("provider down");
  });

  it("uses a 30 second default timeout", () => {
    expect(getAiTimeoutMs("moderation")).toBe(30_000);
  });

  it("times out", async () => {
    generateTextMock.mockReturnValueOnce(new Promise(() => undefined) as never);

    await expect(moderateProjectRequest("jual teh timeout", 1)).rejects.toThrow(
      "AI moderation timed out",
    );
  });
});
