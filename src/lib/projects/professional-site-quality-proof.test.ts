import { describe, expect, it } from "vitest";

import {
  createEmptyGeneratedSiteQualityProofV3,
  sanitizeGeneratedSiteQualityProofV3,
  type GeneratedSiteQualityProofV3,
} from "./professional-site-quality-proof";

const categories = {
  business_specificity: 3,
  first_view_hierarchy: 3,
  content_architecture: 3,
  composition_rhythm: 3,
  typography: 3,
  color_system: 3,
  media_integrity: 3,
  mobile_quality: 3,
  professional_finish: 3,
} as const;

function proof(): GeneratedSiteQualityProofV3 {
  return {
    ...createEmptyGeneratedSiteQualityProofV3({
      contractHash: "c".repeat(64),
      blueprintHash: "b".repeat(64),
      kitId: "bold-typographic",
      mediaMode: "graphic",
    }),
    writerPlanHash: "p".repeat(64),
    calls: {
      writerCalls: 1,
      criticCalls: 1,
      correctionCalls: 0,
      correctionReason: null,
    },
    models: {
      writerRequested: "default-combo",
      writerServed: "served-writer",
      criticRequested: "default-combo",
      criticServed: "served-critic",
      correctionRequested: null,
      correctionServed: null,
    },
    gates: {
      response: "pass",
      source: "pass",
      build: "pass",
      browser: "pass",
      professionalVisual: "pass",
    },
    professional: {
      promptVersion: "professional-static-review-v1",
      minimumRating: 3,
      averageRating: 3,
      categoryRatings: categories,
      unknownReason: null,
    },
    outcome: "pass",
    output: {
      routeCount: 1,
      editableFileCount: 1,
      editableBytes: 100,
      firstFileClosedMs: 20,
    },
  };
}

describe("professional quality proof v3", () => {
  it("starts fail and leaves every gate and model unqualified", () => {
    const value = createEmptyGeneratedSiteQualityProofV3({
      contractHash: "c".repeat(64),
      blueprintHash: "b".repeat(64),
      kitId: "bold-typographic",
      mediaMode: "typographic",
    });
    expect(value).toMatchObject({
      schemaVersion: 3,
      engine: "professional-static-single-shot",
      outcome: "fail",
      calls: { writerCalls: 0, criticCalls: 0, correctionCalls: 0 },
      gates: {
        response: "not_run",
        source: "not_run",
        build: "not_run",
        browser: "not_run",
        professionalVisual: "not_run",
      },
      models: {
        writerRequested: null,
        writerServed: null,
        criticRequested: null,
        criticServed: null,
      },
    });
  });

  it("accepts a complete pass only with all nine ratings and zero hard failures", () => {
    expect(sanitizeGeneratedSiteQualityProofV3(proof())).toMatchObject({
      outcome: "pass",
      professional: { minimumRating: 3, unknownReason: null },
    });
  });

  it.each([
    [
      "unknown visual",
      { gates: { ...proof().gates, professionalVisual: "unknown" } },
    ],
    [
      "missing category",
      {
        professional: {
          ...proof().professional,
          categoryRatings: { business_specificity: 3 },
        },
      },
    ],
    ["hard failure", { hardFailures: { ...proof().hardFailures, fact: 1 } }],
    [
      "missing served critic",
      { models: { ...proof().models, criticServed: null } },
    ],
    [
      "low rating",
      { professional: { ...proof().professional, minimumRating: 2 } },
    ],
  ])("rejects pass with %s", (_name, patch) => {
    expect(() =>
      sanitizeGeneratedSiteQualityProofV3({
        ...proof(),
        ...patch,
      } as GeneratedSiteQualityProofV3),
    ).toThrow("professional quality proof pass requires");
  });

  it("rejects duplicate calls and correction reason without a correction", () => {
    expect(() =>
      sanitizeGeneratedSiteQualityProofV3({
        ...proof(),
        calls: { ...proof().calls, writerCalls: 2 as 0 | 1 },
      }),
    ).toThrow("call count");
    expect(() =>
      sanitizeGeneratedSiteQualityProofV3({
        ...proof(),
        calls: { ...proof().calls, correctionReason: "source_gate" },
      }),
    ).toThrow("correction reason");
  });

  it("accepts and sanitizes one correction while dropping private fields", () => {
    const value = sanitizeGeneratedSiteQualityProofV3({
      ...proof(),
      calls: {
        writerCalls: 1,
        criticCalls: 1,
        correctionCalls: 1,
        correctionReason: "source_gate",
      },
      models: {
        ...proof().models,
        correctionRequested: "default-combo",
        correctionServed: "served-writer",
      },
      privatePrompt: "owner phone 08123456789",
      blueprintProse: "private owner copy",
      screenshotEvidenceRef: "https://private.invalid/image.jpg",
    } as unknown as GeneratedSiteQualityProofV3);
    expect(value.calls.correctionCalls).toBe(1);
    expect(value).not.toHaveProperty("privatePrompt");
    expect(JSON.stringify(value)).not.toContain("08123456789");
    expect(JSON.stringify(value)).not.toContain("private.invalid");
  });
});
