import { describe, expect, it } from "vitest";

import {
  SPARSE_BUSINESS_CATEGORIES,
  SPARSE_CASE_CONDITIONS,
  SPARSE_EVALUATION_CORPUS,
  evaluateSparseCase,
} from "./sparse-evaluation-corpus";

describe("sparse evaluation corpus", () => {
  it("contains exactly eight categories and four conditions", () => {
    expect(SPARSE_BUSINESS_CATEGORIES).toHaveLength(8);
    expect(SPARSE_CASE_CONDITIONS).toHaveLength(4);
    expect(SPARSE_EVALUATION_CORPUS).toHaveLength(32);
    expect(new Set(SPARSE_EVALUATION_CORPUS.map((item) => item.id)).size).toBe(
      32,
    );
  });

  it("contains every category-condition pair exactly once", () => {
    for (const category of SPARSE_BUSINESS_CATEGORIES) {
      for (const condition of SPARSE_CASE_CONDITIONS) {
        expect(
          SPARSE_EVALUATION_CORPUS.filter(
            (item) =>
              item.category === category && item.condition === condition,
          ),
        ).toHaveLength(1);
      }
    }
  });

  it("validates every scenario through truth, omission, readiness, strategy, and review surfaces", () => {
    const results = SPARSE_EVALUATION_CORPUS.map(evaluateSparseCase);

    expect(results).toHaveLength(32);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(results.every((result) => result.truthBoundaryValid)).toBe(true);
    expect(results.every((result) => result.omissionStateValid)).toBe(true);
    expect(results.every((result) => result.readinessValid)).toBe(true);
    expect(results.every((result) => result.strategyInputValid)).toBe(true);
    expect(results.every((result) => result.reviewRequestValid)).toBe(true);
  });

  it("keeps unsupported fact leakage at zero for every scenario", () => {
    const results = SPARSE_EVALUATION_CORPUS.map(evaluateSparseCase);

    expect(
      results.reduce(
        (total, result) => total + result.unsupportedFactLeakage,
        0,
      ),
    ).toBe(0);
    expect(
      results.reduce((total, result) => total + result.remoteMediaRequests, 0),
    ).toBe(0);
    expect(
      results.reduce((total, result) => total + result.placeholderCount, 0),
    ).toBe(0);
  });

  it("keeps no-photo scenarios free of media requests and repeated photo questions", () => {
    const results = SPARSE_EVALUATION_CORPUS.filter(
      (item) => item.condition === "no_photo",
    ).map(evaluateSparseCase);

    expect(results).toHaveLength(8);
    expect(results.every((result) => result.remoteMediaRequests === 0)).toBe(
      true,
    );
    expect(results.every((result) => result.placeholderCount === 0)).toBe(true);
    expect(
      results.every((result) => result.repeatedOmittedQuestions === 0),
    ).toBe(true);
  });

  it("keeps explicit omissions stable across all categories", () => {
    const results = SPARSE_EVALUATION_CORPUS.filter(
      (item) => item.condition === "explicit_omission",
    ).map(evaluateSparseCase);

    expect(results).toHaveLength(8);
    expect(results.every((result) => result.omissionStateValid)).toBe(true);
    expect(
      results.every((result) => result.repeatedOmittedQuestions === 0),
    ).toBe(true);
  });

  it("does not open a tenant-crossing or generated-skill output surface", () => {
    const serialized = JSON.stringify(SPARSE_EVALUATION_CORPUS);

    expect(serialized).not.toContain(".agents/");
    expect(serialized).not.toContain("run_skill_script");
  });

  it("keeps Tier 1 closed only for the intentionally partial cases", () => {
    const results = SPARSE_EVALUATION_CORPUS.map((item) => ({
      expected: item.expected.tier1Satisfied,
      result: evaluateSparseCase(item).readinessValid,
    }));

    expect(results.every(({ result }) => result)).toBe(true);
    expect(
      SPARSE_EVALUATION_CORPUS.every(
        (item) => item.expected.tier1Satisfied === true,
      ),
    ).toBe(true);
  });
});
