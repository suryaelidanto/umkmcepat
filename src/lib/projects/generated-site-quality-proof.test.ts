import { describe, expect, it } from "vitest";

import {
  createEmptyGeneratedSiteQualityProofV2,
  sanitizeGeneratedSiteQualityProofV2,
} from "./generated-site-quality-proof";

describe("generated-site quality proof v2", () => {
  it("starts unqualified and records only declared call fields", () => {
    const proof = createEmptyGeneratedSiteQualityProofV2({
      contractHash: "a".repeat(64),
      planHash: "b".repeat(64),
      kitId: "editorial-airy",
      mediaMode: "typographic",
    });
    expect(proof.outcome).toBe("fail");
    expect(proof.calls).toEqual({
      writerCalls: 0,
      criticCalls: 0,
      correctionCalls: 0,
      correctionReason: null,
    });
    expect(proof.gates).toEqual({
      response: "not_run",
      source: "not_run",
      build: "not_run",
      browser: "not_run",
      visual: "not_run",
    });
  });

  it("accepts deterministic gates with an unknown visual critic", () => {
    const proof = createEmptyGeneratedSiteQualityProofV2({
      contractHash: "a".repeat(64),
      planHash: "b".repeat(64),
      kitId: "warm-commerce",
      mediaMode: "graphic",
    });
    expect(
      sanitizeGeneratedSiteQualityProofV2({
        ...proof,
        outcome: "pass",
        gates: {
          response: "pass",
          source: "pass",
          build: "pass",
          browser: "pass",
          visual: "unknown",
        },
      }).gates.visual,
    ).toBe("unknown");
  });

  it("rejects a visual fail even when deterministic gates pass", () => {
    const proof = createEmptyGeneratedSiteQualityProofV2({
      contractHash: "a".repeat(64),
      planHash: "b".repeat(64),
      kitId: "warm-commerce",
      mediaMode: "graphic",
    });
    expect(() =>
      sanitizeGeneratedSiteQualityProofV2({
        ...proof,
        outcome: "pass",
        gates: {
          response: "pass",
          source: "pass",
          build: "pass",
          browser: "pass",
          visual: "fail",
        },
      }),
    ).toThrow("quality proof pass requires every gate");
  });

  it("rejects proof that claims success with incomplete gates", () => {
    const proof = createEmptyGeneratedSiteQualityProofV2({
      contractHash: "a".repeat(64),
      planHash: "b".repeat(64),
      kitId: "bold-typographic",
      mediaMode: "graphic",
    });
    expect(() =>
      sanitizeGeneratedSiteQualityProofV2({
        ...proof,
        outcome: "pass",
      }),
    ).toThrow("quality proof pass requires every gate");
  });

  it("drops private evidence fields and rejects duplicate calls", () => {
    const proof = createEmptyGeneratedSiteQualityProofV2({
      contractHash: "a".repeat(64),
      planHash: "b".repeat(64),
      kitId: "catalog-story",
      mediaMode: "owner_assets",
    });
    expect(() =>
      sanitizeGeneratedSiteQualityProofV2({
        ...proof,
        calls: {
          writerCalls: 2 as 0 | 1,
          criticCalls: 1,
          correctionCalls: 1,
          correctionReason: "source_gate",
        },
        privatePrompt: "owner phone 08123456789",
        screenshotUrl: "https://private.invalid/screenshot.jpg",
      } as unknown as typeof proof),
    ).toThrow("quality proof call count exceeds budget");
  });
});
