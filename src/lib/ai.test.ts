import { describe, expect, it } from "vitest";

import { getNoReasoningCallOptions } from "@/lib/ai";

describe("getNoReasoningCallOptions", () => {
  it("returns AI SDK reasoning none preference", () => {
    expect(getNoReasoningCallOptions()).toEqual({ reasoning: "none" });
  });
});
