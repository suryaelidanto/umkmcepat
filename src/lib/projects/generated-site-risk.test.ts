import { describe, expect, it } from "vitest";

import { classifyGeneratedSiteRisk } from "./generated-site-risk";

import type { BrowserGateReport } from "./browser-gates";

const browser: BrowserGateReport = {
  version: 1,
  status: "pass",
  routes: [],
  evidenceIds: [],
  overheadMs: 10,
};

describe("classifyGeneratedSiteRisk", () => {
  it("keeps a clean known recipe non-risky", () => {
    expect(
      classifyGeneratedSiteRisk({
        attemptId: "a1",
        recipeId: "retail-catalog",
        recipeRiskTags: [],
        sourceRiskSignals: [],
        browserReport: browser,
        sampleRate: 0,
      }).risky,
    ).toBe(false);
  });

  it("carries source and recipe risks as evidence", () => {
    const result = classifyGeneratedSiteRisk({
      attemptId: "a1",
      recipeId: "retail-catalog",
      recipeRiskTags: ["image_led"],
      sourceRiskSignals: [
        {
          code: "narrow-rich-page",
          message: "narrow",
          category: "genericness",
        },
      ],
      browserReport: browser,
      sampleRate: 0,
    });
    expect(result.risky).toBe(true);
    expect(result.reasons.map((reason) => reason.category)).toEqual(
      expect.arrayContaining(["image_led", "genericness"]),
    );
  });

  it("samples deterministically", () => {
    const input = {
      attemptId: "stable-attempt",
      recipeId: "generic",
      recipeRiskTags: [],
      sourceRiskSignals: [],
      browserReport: browser,
      sampleRate: 0.5,
    };
    expect(classifyGeneratedSiteRisk(input)).toEqual(
      classifyGeneratedSiteRisk(input),
    );
  });
});
