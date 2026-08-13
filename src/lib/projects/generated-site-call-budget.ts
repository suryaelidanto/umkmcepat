export type GeneratedSiteCorrectionReason =
  | "transport"
  | "response_contract"
  | "source_gate"
  | "build"
  | "browser"
  | "visual_machine_verifiable";

export type GeneratedSiteCallBudgetSnapshot = {
  writerCalls: 0 | 1;
  criticCalls: 0 | 1;
  correctionCalls: 0 | 1;
  correctionReason: GeneratedSiteCorrectionReason | null;
};

export class GeneratedSiteCallBudget {
  private writerCalls = 0 as 0 | 1;
  private criticCalls = 0 as 0 | 1;
  private correctionCalls = 0 as 0 | 1;
  private correctionReason: GeneratedSiteCorrectionReason | null = null;

  consumeWriter(): void {
    if (this.writerCalls === 1) {
      throw new Error("generated-site writer call budget exhausted");
    }
    this.writerCalls = 1;
  }

  consumeCritic(): void {
    if (this.criticCalls === 1) {
      throw new Error("generated-site critic call budget exhausted");
    }
    this.criticCalls = 1;
  }

  consumeCorrection(reason: GeneratedSiteCorrectionReason): void {
    if (this.correctionCalls === 1) {
      throw new Error("generated-site correction call budget exhausted");
    }
    this.correctionCalls = 1;
    this.correctionReason = reason;
  }

  snapshot(): GeneratedSiteCallBudgetSnapshot {
    return {
      writerCalls: this.writerCalls,
      criticCalls: this.criticCalls,
      correctionCalls: this.correctionCalls,
      correctionReason: this.correctionReason,
    };
  }
}
