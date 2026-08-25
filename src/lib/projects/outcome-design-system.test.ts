import { describe, expect, it } from "vitest";

import {
  compileOutcomeDesignSystem,
  type GeneratedDesignSystemProposalV1,
} from "./outcome-design-system";

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

describe("compileOutcomeDesignSystem", () => {
  it("compiles valid design system successfully", () => {
    const result = compileOutcomeDesignSystem(validLightProposal);
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

    const result = compileOutcomeDesignSystem(badContrast);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((issue) => issue.pair.includes("muted"))).toBe(
        true,
      );
    }
  });
});
