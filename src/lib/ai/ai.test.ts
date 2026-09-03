import { describe, expect, it } from "vitest";

import { getNoReasoningCallOptions } from "@/lib/ai/ai";

describe("getNoReasoningCallOptions", () => {
  // ponytail: "minimal" avoids quota-limited "none" route in 9router combos.
  it("returns the lowest healthy reasoning effort", () => {
    expect(getNoReasoningCallOptions()).toMatchObject({
      reasoning: "minimal",
    });
  });

  it("sets the 9Router provider reasoning effort to minimal", () => {
    expect(getNoReasoningCallOptions()).toMatchObject({
      providerOptions: { "9router": { reasoningEffort: "minimal" } },
    });
  });
});
