import { describe, expect, it } from "vitest";

import { shouldShowRevealButton } from "./SensitiveText";

describe("SensitiveText reveal control", () => {
  it("hides reveal controls when streamer mode is enabled", () => {
    expect(shouldShowRevealButton(true, true)).toBe(false);
  });
});
