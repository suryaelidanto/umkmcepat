import { describe, expect, it } from "vitest";

import {
  getAvailableAiModels,
  getChatAiModel,
  getDefaultAiModel,
  getEditAiModel,
} from "./ai-models";

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

  it("uses a small/flash model for edit when no explicit edit model is set", () => {
    const previous = process.env.AI_EDIT_MODEL;
    delete process.env.AI_EDIT_MODEL;

    try {
      expect(getEditAiModel(["kimi", "pro", "deepseek-flash"])).toBe(
        "deepseek-flash",
      );
    } finally {
      process.env.AI_EDIT_MODEL = previous;
    }
  });

  it("uses a small/flash model for chat when no explicit chat model is set", () => {
    const previous = process.env.AI_CHAT_MODEL;
    delete process.env.AI_CHAT_MODEL;

    try {
      expect(getChatAiModel(["kimi", "pro", "deepseek-flash"])).toBe(
        "deepseek-flash",
      );
    } finally {
      process.env.AI_CHAT_MODEL = previous;
    }
  });
});
