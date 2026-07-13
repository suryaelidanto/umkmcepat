import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_AI_MODEL, getDefaultAiModel } from "./ai-models";

describe("AI model config", () => {
  const previous = process.env.AI_MODELS;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.AI_MODELS;
    } else {
      process.env.AI_MODELS = previous;
    }
  });

  it("uses the first listed model as the default", () => {
    expect(getDefaultAiModel("fast, pro, flash")).toBe("fast");
  });

  it("uses a single model list value as the default", () => {
    expect(getDefaultAiModel("combo/umkmcepat-combo")).toBe(
      "combo/umkmcepat-combo",
    );
  });

  it("falls back to the platform combo when AI_MODELS is empty or unset", () => {
    delete process.env.AI_MODELS;
    expect(getDefaultAiModel("")).toBe(DEFAULT_AI_MODEL);
    expect(getDefaultAiModel(undefined)).toBe(DEFAULT_AI_MODEL);
  });
});
