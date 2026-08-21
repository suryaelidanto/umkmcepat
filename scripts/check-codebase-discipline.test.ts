import { describe, expect, it } from "vitest";

import {
  findTastePinningAssertions,
  runDisciplineCheck,
} from "./check-codebase-discipline";

describe("findTastePinningAssertions", () => {
  it("rejects tests that pin generated visual taste", () => {
    expect(
      findTastePinningAssertions('expect(result.kitId).toBe("warm-commerce");'),
    ).toHaveLength(1);
  });

  it("allows generated output tests that enforce accessibility", () => {
    expect(
      findTastePinningAssertions(
        "expect(report.contrastFailures).toEqual([]);",
      ),
    ).toEqual([]);
  });
});

describe("check-codebase-discipline", () => {
  it("runs without throwing and returns an array of violations", () => {
    const violations = runDisciplineCheck();
    expect(Array.isArray(violations)).toBe(true);
  });
});
