import { describe, expect, it } from "vitest";

import { getAvailableAiModels, getDefaultAiModel } from "./ai-models";

describe("AI model config", () => {
  it("parses a comma-separated model list", () => {
    expect(getAvailableAiModels("a, b ,, c")).toEqual(["a", "b", "c"]);
  });

  it("uses a single model list value as both option and default", () => {
    expect(getAvailableAiModels("cmc/deepseek/deepseek-v4-pro")).toEqual([
      "cmc/deepseek/deepseek-v4-pro",
    ]);
    expect(getDefaultAiModel(["cmc/deepseek/deepseek-v4-pro"])).toBe(
      "cmc/deepseek/deepseek-v4-pro",
    );
  });

  it("uses the first listed model as the default", () => {
    expect(getDefaultAiModel(["fast", "pro"])).toBe("fast");
  });
});
