import { describe, expect, it, vi } from "vitest";

import {
  BUILD_CREATIVE_DIRECTION_MAX_CHARS,
  buildCreativeDirectionPrompt,
  hashBuildCreativeDirection,
  normalizeBuildCreativeDirection,
} from "./build-creative-direction";

import type { UIMessage } from "ai";

vi.mock("@/lib/ai", () => ({
  getAiModel: vi.fn(),
  getAiTelemetry: vi.fn(() => ({})),
}));

function transcript(): UIMessage[] {
  return [
    {
      id: "1",
      role: "user",
      parts: [{ type: "text", text: "warung nasi ayam deket kampus" }],
    },
    {
      id: "2",
      role: "assistant",
      parts: [{ type: "text", text: "Apa keunggulan utamanya?" }],
    },
    {
      id: "3",
      role: "user",
      parts: [{ type: "text", text: "kenyang murah lah, mahasiswa suka" }],
    },
  ] as unknown as UIMessage[];
}

describe("buildCreativeDirectionPrompt", () => {
  it("carries the conversation and forbids inventing facts", () => {
    const prompt = buildCreativeDirectionPrompt({
      businessName: "Ayam Nasi Enak",
      businessType: "fnb",
      messages: transcript(),
    });

    expect(prompt.user).toContain("kenyang murah lah");
    expect(prompt.user).toContain("warung nasi ayam deket kampus");
    expect(prompt.system).toMatch(/expert/i);
    expect(prompt.system).toMatch(/never (?:invent|state)/i);
    expect(prompt.system).toContain(
      BUILD_CREATIVE_DIRECTION_MAX_CHARS.toString(),
    );
  });

  it("drops non-text parts and keeps the transcript bounded", () => {
    const noisy = [
      ...transcript(),
      {
        id: "4",
        role: "user",
        parts: [{ type: "file", url: "https://example.com/a.png" }],
      },
    ] as unknown as UIMessage[];

    const prompt = buildCreativeDirectionPrompt({
      businessName: "Ayam Nasi Enak",
      businessType: "fnb",
      messages: noisy,
    });

    expect(prompt.user).not.toContain("example.com");
  });
});

describe("normalizeBuildCreativeDirection", () => {
  it("trims, collapses, and bounds the model's prose", () => {
    const direction = normalizeBuildCreativeDirection(
      `  Lead with the filling portion   for a student budget.\n\n${"very ".repeat(
        800,
      )}  `,
    );

    expect(direction).not.toBeNull();
    expect(direction!.length).toBeLessThanOrEqual(
      BUILD_CREATIVE_DIRECTION_MAX_CHARS,
    );
    expect(direction!.startsWith("Lead with the filling portion for a")).toBe(
      true,
    );
  });

  it("rejects empty or whitespace-only output", () => {
    expect(normalizeBuildCreativeDirection("   \n  ")).toBeNull();
    expect(normalizeBuildCreativeDirection(undefined)).toBeNull();
  });
});

describe("hashBuildCreativeDirection", () => {
  it("is stable for equal direction and differs otherwise", () => {
    const a = hashBuildCreativeDirection("Lead with the portion size.");
    const b = hashBuildCreativeDirection("Lead with the portion size.");
    const c = hashBuildCreativeDirection("Lead with the price.");

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
