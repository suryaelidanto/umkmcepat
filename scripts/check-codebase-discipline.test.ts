import { describe, expect, it } from "vitest";

import { runDisciplineCheck } from "./check-codebase-discipline";

describe("check-codebase-discipline", () => {
  it("runs without throwing and returns an array of violations", () => {
    const violations = runDisciplineCheck();
    expect(Array.isArray(violations)).toBe(true);
  });
});
