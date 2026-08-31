import { describe, expect, it } from "vitest";

import {
  compileGeneratedDesignSystem,
  contrastRatio,
  parseHexColor,
  type GeneratedDesignSystemProposalV1,
} from "./generated-design-system";

const validLightProposal: GeneratedDesignSystemProposalV1 = {
  accent: "#0369a1", // Sky-700 gives > 4.5:1 on white
  accentForeground: "#ffffff",
  background: "#f8fafc",
  bodyFontStackId: "system-humanist",
  border: "#e2e8f0",
  card: "#ffffff",
  cardForeground: "#0f172a",
  displayFontStackId: "system-editorial",
  foreground: "#0f172a",
  muted: "#f1f5f9",
  mutedForeground: "#475569", // Slate-600 gives > 4.5:1 on light muted
  primary: "#0f172a",
  primaryForeground: "#ffffff",
  radiusScale: "restrained",
  ring: "#0369a1",
};

describe("compileGeneratedDesignSystem", () => {
  it("supports the OKLCH values required by the Impeccable palette workflow", () => {
    const white = parseHexColor("oklch(1 0 0)");
    expect(white).toEqual({ r: 255, g: 255, b: 255 });
    expect(contrastRatio("oklch(0.15 0 0)", "oklch(1 0 0)")).toBeGreaterThan(7);

    const result = compileGeneratedDesignSystem({
      ...validLightProposal,
      accent: "oklch(0.45 0.18 40)",
      accentForeground: "oklch(1 0 0)",
      background: "oklch(1 0 0)",
      border: "oklch(0.9 0 0)",
      card: "oklch(1 0 0)",
      cardForeground: "oklch(0.15 0 0)",
      foreground: "oklch(0.15 0 0)",
      muted: "oklch(0.95 0 0)",
      mutedForeground: "oklch(0.4 0 0)",
      primary: "oklch(0.15 0 0)",
      primaryForeground: "oklch(1 0 0)",
      ring: "oklch(0.45 0.18 40)",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.css).toContain("oklch(0.45 0.18 40)");
    }
  });

  it("compiles valid design system successfully", () => {
    const result = compileGeneratedDesignSystem(validLightProposal);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.css).toBe("string");
      expect(result.css.length).toBeGreaterThan(0);
      expect(result.proposal.primary).toBe("#0f172a");
    }
  });

  it("rejects design systems with unreadable contrast", () => {
    const badContrast: GeneratedDesignSystemProposalV1 = {
      ...validLightProposal,
      mutedForeground: "#e2e8f0", // Very low contrast on light muted bg
    };

    const result = compileGeneratedDesignSystem(badContrast);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((issue) => issue.pair.includes("muted"))).toBe(
        true,
      );
    }
  });
});
