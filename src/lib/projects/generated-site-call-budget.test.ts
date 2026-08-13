import { describe, expect, it } from "vitest";

import {
  GeneratedSiteCallBudget,
  type GeneratedSiteCorrectionReason,
} from "./generated-site-call-budget";

describe("GeneratedSiteCallBudget", () => {
  it("permits one writer, one critic, and one correction", () => {
    const budget = new GeneratedSiteCallBudget();
    budget.consumeWriter();
    budget.consumeCritic();
    budget.consumeCorrection("source_gate");
    expect(budget.snapshot()).toEqual({
      writerCalls: 1,
      criticCalls: 1,
      correctionCalls: 1,
      correctionReason: "source_gate",
    });
  });

  it.each(["writer", "critic", "correction"] as const)(
    "rejects a second %s call",
    (leg) => {
      const budget = new GeneratedSiteCallBudget();
      const consume = {
        writer: () => budget.consumeWriter(),
        critic: () => budget.consumeCritic(),
        correction: () => budget.consumeCorrection("transport"),
      }[leg];
      consume();
      expect(consume).toThrow(`generated-site ${leg} call budget exhausted`);
    },
  );

  it("keeps the first correction reason immutable", () => {
    const budget = new GeneratedSiteCallBudget();
    const reason: GeneratedSiteCorrectionReason = "browser";
    budget.consumeCorrection(reason);
    expect(() => budget.consumeCorrection("visual_machine_verifiable")).toThrow(
      "generated-site correction call budget exhausted",
    );
    expect(budget.snapshot().correctionReason).toBe(reason);
  });
});
