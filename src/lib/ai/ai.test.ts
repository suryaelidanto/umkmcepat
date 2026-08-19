import { describe, expect, it } from "vitest";

import { getNoReasoningCallOptions } from "@/lib/ai/ai";

describe("getNoReasoningCallOptions", () => {
  it("returns AI SDK reasoning none preference", () => {
    expect(getNoReasoningCallOptions()).toMatchObject({ reasoning: "none" });
  });

  it("sets the 9Router provider reasoning effort to none", () => {
    expect(getNoReasoningCallOptions()).toMatchObject({
      providerOptions: { "9router": { reasoningEffort: "none" } },
    });
  });
});
