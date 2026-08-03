import { describe, expect, it } from "vitest";

import { resolveGenerationEngine } from "./generation-engine";

describe("resolveGenerationEngine", () => {
  it.each([
    ["off", true, true, "legacy-v1"],
    ["internal", true, false, "contract-v1"],
    ["internal", false, true, "legacy-v1"],
    ["pilot", true, false, "legacy-v1"],
    ["pilot", false, true, "contract-v1"],
    ["all", false, false, "contract-v1"],
  ] as const)(
    "assigns %s deterministically",
    (rollout, admin, waitlistApproved, expected) => {
      expect(
        resolveGenerationEngine({ rollout, admin, waitlistApproved }),
      ).toBe(expected);
    },
  );

  it("never treats a missing waitlist approval as pilot eligibility", () => {
    expect(
      resolveGenerationEngine({
        rollout: "pilot",
        admin: false,
        waitlistApproved: false,
      }),
    ).toBe("legacy-v1");
  });
});
