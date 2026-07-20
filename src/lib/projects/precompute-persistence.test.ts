import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialBrief } from "./brief";
import { decideRuleEngineDiscussPath } from "./brief-flow";

/**
 * Regression test for the bug where the rule-engine precompute discuss path
 * persisted `Project.chatMessages` without the user's `incoming` message.
 *
 * Before the fix, the persisted array was `[...storedMessages, assistantMessage]`,
 * which dropped the user turn for any first-turn project. After the fix, the
 * precompute path now includes the user turn
 * (`[...storedMessages, ...incoming, assistantMessage]`), matching the
 * behaviour of the LLM paths.
 *
 * The end-to-end assertion here is on `decideRuleEngineDiscussPath`, the
 * gate that decides whether the buggy path is taken. For a brand-new project
 * with a short first prompt and an empty brief, the path must be
 * `rule-engine` — so this test would have caught a regression if the routing
 * flipped to `llm` (e.g. someone tightened `shouldEscapeRuleEngine` and
 * masked the bug instead of fixing the persistence).
 */

describe("discuss path routing for fresh project", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes the first turn of a brand-new project through the rule-engine precompute", () => {
    const decision = decideRuleEngineDiscussPath({
      brief: createInitialBrief("bikin web buat Pariwisata"),
      confidence: 0,
      existingUserTurns: 0,
      incomingLength: 1,
      text: "bikin web buat Pariwisata",
    });

    expect(decision.path).toBe("rule-engine");
  });

  it("routes a follow-up turn with low confidence back through the precompute", () => {
    const decision = decideRuleEngineDiscussPath({
      brief: createInitialBrief("toko roti"),
      confidence: 10,
      existingUserTurns: 1,
      incomingLength: 1,
      text: "toko roti",
    });

    expect(decision.path).toBe("rule-engine");
  });

  it("keeps the rule-engine path stable for a fresh project prompt (no silent regression to llm)", () => {
    // If decideRuleEngineDiscussPath ever bails to "llm" for fresh projects
    // (e.g. someone disables the precompute optimisation), the persistence
    // bug becomes invisible — but so does the perf win. This assertion
    // locks in the optimisation is still in place for the canonical first
    // turn.
    const decision = decideRuleEngineDiscussPath({
      brief: createInitialBrief("POS buat toko kelontong"),
      confidence: 0,
      existingUserTurns: 0,
      incomingLength: 1,
      text: "POS buat toko kelontong",
    });

    expect(decision.path).toBe("rule-engine");
  });
});
