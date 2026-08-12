import { describe, expect, it } from "vitest";

import { isGeneratedSiteQualityEnabled } from "./generated-site-rollout";

describe("isGeneratedSiteQualityEnabled", () => {
  it.each([
    ["off", true, true, false],
    ["internal", true, false, true],
    ["internal", false, true, false],
    ["pilot", true, false, true],
    ["pilot", false, true, true],
    ["pilot", false, false, false],
    ["all", false, false, true],
  ] as const)("resolves %s", (rollout, admin, approved, expected) => {
    expect(
      isGeneratedSiteQualityEnabled({
        rollout,
        admin,
        waitlistApproved: approved,
      }),
    ).toBe(expected);
  });

  it("fails closed on an unknown value", () => {
    expect(
      isGeneratedSiteQualityEnabled({
        rollout: "wrong",
        admin: true,
        waitlistApproved: true,
      }),
    ).toBe(false);
  });
});
