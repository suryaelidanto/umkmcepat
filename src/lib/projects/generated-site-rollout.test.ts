import { describe, expect, it } from "vitest";

import { resolveApprovedReferenceCalibratedMode } from "./generated-site-rollout";

describe("reference-calibrated rollout mode", () => {
  it("always resolves to replace (design pipeline is the only build path)", () => {
    expect(resolveApprovedReferenceCalibratedMode()).toBe("replace");
  });
});
