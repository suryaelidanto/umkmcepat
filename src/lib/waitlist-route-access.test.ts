import { describe, expect, it } from "vitest";

import { isWaitlistMarketingPublicPath } from "./waitlist-route-access";

describe("isWaitlistMarketingPublicPath", () => {
  it("allows marketing and gate pages", () => {
    expect(isWaitlistMarketingPublicPath("/")).toBe(true);
    expect(isWaitlistMarketingPublicPath("/terms")).toBe(true);
    expect(isWaitlistMarketingPublicPath("/privacy")).toBe(true);
    expect(isWaitlistMarketingPublicPath("/waitlist")).toBe(true);
  });

  it("blocks product pages", () => {
    expect(isWaitlistMarketingPublicPath("/projects")).toBe(false);
    expect(isWaitlistMarketingPublicPath("/projects/abc")).toBe(false);
    expect(isWaitlistMarketingPublicPath("/admin")).toBe(false);
  });
});
