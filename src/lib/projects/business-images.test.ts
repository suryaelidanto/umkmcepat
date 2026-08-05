import { describe, expect, it } from "vitest";

import {
  parseProjectBrief,
  briefToBuildPrompt,
  mergeProjectBriefPatch,
} from "./brief";

describe("businessImages", () => {
  it("parses and normalizes businessImages, dropping invalid purposes", () => {
    const brief = parseProjectBrief(
      {
        businessImages: [
          { id: "a1", purpose: "business-image" },
          { id: "a2", purpose: "logo" },
          { id: "a3", purpose: "bogus" },
        ],
      },
      "prompt",
    );
    expect(brief.businessImages).toEqual([
      { id: "a1", purpose: "business-image" },
      { id: "a2", purpose: "logo" },
    ]);
  });

  it("defaults businessImages to an empty array when absent", () => {
    const brief = parseProjectBrief({}, "prompt");
    expect(brief.businessImages).toEqual([]);
  });

  it("includes businessImages in the build prompt", () => {
    const brief = parseProjectBrief(
      { businessImages: [{ id: "a1", purpose: "business-image" }] },
      "prompt",
    );
    expect(briefToBuildPrompt(brief)).toContain("/media/a1");
  });

  it("scrubBriefForStorage keeps businessImages", async () => {
    const { scrubBriefForStorage } = await import("./discuss-turn-shared");
    const brief = parseProjectBrief(
      { businessImages: [{ id: "a1", purpose: "logo" }] },
      "prompt",
    );
    const scrubbed = scrubBriefForStorage(brief, true, "p1");
    expect(scrubbed.businessImages).toEqual([{ id: "a1", purpose: "logo" }]);
  });

  it("mergeProjectBriefPatch accumulates businessImages across turns", () => {
    const current = parseProjectBrief({}, "prompt");
    const merged = mergeProjectBriefPatch(current, {
      businessImages: [{ id: "a1", purpose: "business-image" }],
    });
    const merged2 = mergeProjectBriefPatch(merged, {
      businessImages: [{ id: "a2", purpose: "logo" }],
    });
    expect(merged2.businessImages).toEqual([
      { id: "a1", purpose: "business-image" },
      { id: "a2", purpose: "logo" },
    ]);
  });
});
