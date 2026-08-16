import { describe, expect, it } from "vitest";

import { createInitialScrollRestorationPolicy } from "./router";

describe("initial scroll restoration", () => {
  it("skips the first render and restores scroll on later navigations", () => {
    const shouldRestoreScroll = createInitialScrollRestorationPolicy();

    expect(shouldRestoreScroll()).toBe(false);
    expect(shouldRestoreScroll()).toBe(true);
    expect(shouldRestoreScroll()).toBe(true);
  });
});
