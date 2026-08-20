// src/lib/projects/candidate-qualification.ts

export type QualificationRunBudget = {
  initial: 1;
  compileRepairsRemaining: 0 | 1 | 2;
  browserRepairsRemaining: 0 | 1;
  visualRepairsRemaining: 0 | 1;
  candidatesCreated: number;
};

export type RepairKind = "compile" | "browser" | "visual";

export function createQualificationRunBudget(options?: {
  visualRepairEnabled?: boolean;
}): QualificationRunBudget {
  return {
    initial: 1,
    compileRepairsRemaining: 2,
    browserRepairsRemaining: 1,
    visualRepairsRemaining: options?.visualRepairEnabled ? 1 : 0,
    candidatesCreated: 0,
  };
}

export class QualificationRunBudgetImpl {
  private readonly budget: QualificationRunBudget;

  constructor(budget?: QualificationRunBudget) {
    this.budget = budget ?? createQualificationRunBudget();
  }

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

  createdCandidate(): void {
    this.budget.candidatesCreated += 1;
  }

  snapshot(): QualificationRunBudget {
    return { ...this.budget };
  }
}
