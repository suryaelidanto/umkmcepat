import { afterEach, describe, expect, it } from "vitest";

import { getAgentMaxSteps } from "./ai-agent-steps";

const ENV_KEYS = [
  "AI_AGENT_GENERATE_MAX_STEPS",
  "AI_AGENT_REPAIR_MAX_STEPS",
] as const;

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

describe("getAgentMaxSteps", () => {
  it("defaults generate to 50 and repair to 12", () => {
    expect(getAgentMaxSteps("generate")).toBe(50);
    expect(getAgentMaxSteps("repair")).toBe(12);
  });

  it("clamps generate steps to [20, 100]", () => {
    process.env.AI_AGENT_GENERATE_MAX_STEPS = "5";
    expect(getAgentMaxSteps("generate")).toBe(20);
    process.env.AI_AGENT_GENERATE_MAX_STEPS = "999";
    expect(getAgentMaxSteps("generate")).toBe(100);
    process.env.AI_AGENT_GENERATE_MAX_STEPS = "40";
    expect(getAgentMaxSteps("generate")).toBe(40);
  });

  it("clamps repair steps to [4, 40]", () => {
    process.env.AI_AGENT_REPAIR_MAX_STEPS = "1";
    expect(getAgentMaxSteps("repair")).toBe(4);
    process.env.AI_AGENT_REPAIR_MAX_STEPS = "100";
    expect(getAgentMaxSteps("repair")).toBe(40);
  });

  it("falls back on invalid values", () => {
    process.env.AI_AGENT_GENERATE_MAX_STEPS = "nope";
    expect(getAgentMaxSteps("generate")).toBe(50);
  });
});
