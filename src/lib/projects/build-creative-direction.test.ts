import { describe, expect, it, vi } from "vitest";

import {
  BUILD_CREATIVE_DIRECTION_MAX_CHARS,
  buildCreativeDirectionPrompt,
  hashBuildCreativeDirection,
  normalizeBuildCreativeDirection,
} from "./build-creative-direction";

import type { UIMessage } from "ai";

vi.mock("@/lib/ai/ai", () => ({
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

  it("tells the model the owner has no photos to direct", () => {
    const prompt = buildCreativeDirectionPrompt({
      businessName: "Seblak Surya",
      businessType: "fnb",
      messages: transcript(),
      mediaMode: "typographic",
    });

    expect(prompt.system).toMatch(/no photo/i);
    expect(prompt.system).toMatch(/never.*photograph/i);
    // A graphic idea rendered as an empty styled box trips empty-graphic-frame.
    expect(prompt.system).toMatch(/inline SVG/i);
  });

  it("lets the model direct real photography when the owner supplied it", () => {
    const prompt = buildCreativeDirectionPrompt({
      businessName: "Seblak Surya",
      businessType: "fnb",
      messages: transcript(),
      mediaMode: "owner_assets",
    });

    expect(prompt.system).toMatch(/photo/i);
    expect(prompt.system).not.toMatch(/never.*photograph/i);
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

  it("ends on a whole sentence instead of a cut-off word", () => {
    // Observed live: the writer received "Use a lively visual mot".
    const sentence = "Lead with the ceker and keep the order button close. ";
    const direction = normalizeBuildCreativeDirection(
      sentence.repeat(40) + "Use a lively visual motif across the menu cards.",
    );

    expect(direction!.endsWith(".")).toBe(true);
    expect(direction!.length).toBeLessThanOrEqual(
      BUILD_CREATIVE_DIRECTION_MAX_CHARS,
    );
    expect(direction!.endsWith("close.")).toBe(true);
  });

  it("drops a dangling sentence even when the model stopped early", () => {
    // Observed live at 817 chars, well under the cap: the model simply ran out
    const direction = normalizeBuildCreativeDirection(
      "Lead with the ceker and keep ordering one tap away. A made-for-them idea: build the hero like a canteen order board with three oversized menu cards and",
    );

    expect(direction).toBe(
      "Lead with the ceker and keep ordering one tap away.",
    );
  });

  it("keeps text that has no sentence end rather than returning nothing", () => {
    expect(normalizeBuildCreativeDirection("Lead with the ceker")).toBe(
      "Lead with the ceker",
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
