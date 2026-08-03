// src/lib/projects/candidate-qualification.ts
// Immutable candidate qualification run for contract-v1. One run begins with
// each explicit user-triggered generation/edit/retry attempt; automatic
// repairs share one bounded budget and never mutate the parent candidate.
// A failed child never replaces the project's last-known-good candidate.

export type QualificationRunBudget = {
  initial: 1;
  compileRepairsRemaining: 0 | 1 | 2;
  browserRepairsRemaining: 0 | 1;
  visualRepairsRemaining: 0 | 1;
  candidatesCreated: number;
};

export type RepairKind = "compile" | "browser" | "visual";

/** Fresh bounded budget for one explicit qualification run. Visual repair is
 * disabled in shadow mode (0); calibration may raise it later. */
export function createQualificationRunBudget(): QualificationRunBudget {
  return {
    initial: 1,
    compileRepairsRemaining: 2,
    browserRepairsRemaining: 1,
    visualRepairsRemaining: 0,
    candidatesCreated: 0,
  };
}

export class QualificationRunBudgetImpl {
  private readonly budget: QualificationRunBudget;

  constructor(budget?: QualificationRunBudget) {
    this.budget = budget ?? createQualificationRunBudget();
  }

  /** Consume one repair of the given kind; throws when exhausted. A failed
   * child that must be recompiled consumes a compile repair. */
  consume(kind: RepairKind): void {
    if (kind === "compile") {
      if (this.budget.compileRepairsRemaining === 0) {
        throw new Error("repair budget exhausted");
      }
      this.budget.compileRepairsRemaining = (this.budget
        .compileRepairsRemaining - 1) as 0 | 1 | 2;
    } else if (kind === "browser") {
      if (this.budget.browserRepairsRemaining === 0) {
        throw new Error("repair budget exhausted");
      }
      this.budget.browserRepairsRemaining = 0 as 0 | 1;
    } else {
      if (this.budget.visualRepairsRemaining === 0) {
        throw new Error("repair budget exhausted");
      }
      this.budget.visualRepairsRemaining = 0 as 0 | 1;
    }
  }

  /** Register a new immutable child candidate. */
  createdCandidate(): void {
    this.budget.candidatesCreated += 1;
  }

  snapshot(): QualificationRunBudget {
    return { ...this.budget };
  }
}
