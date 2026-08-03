import { describe, expect, it } from "vitest";

import {
  QualificationRunBudgetImpl,
  createQualificationRunBudget,
} from "./candidate-qualification";

describe("createQualificationRunBudget", () => {
  it("seeds the full bounded budget for one explicit run", () => {
    const budget = createQualificationRunBudget();
    expect(budget).toEqual({
      initial: 1,
      compileRepairsRemaining: 2,
      browserRepairsRemaining: 1,
      visualRepairsRemaining: 0,
      candidatesCreated: 0,
    });
  });

  it("shares repair budgets across categories within a run", () => {
    const budget = new QualificationRunBudgetImpl();
    budget.consume("compile");
    budget.consume("compile");
    expect(() => budget.consume("compile")).toThrow("repair budget exhausted");
  });
});
