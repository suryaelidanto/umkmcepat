import { describe, expect, it } from "vitest";

import {
  isWaitlistPagePath,
  isWaitlistGateBypassPath,
  isWaitlistMarketingPublicPath,
} from "./waitlist-route-access";

describe("isWaitlistPagePath", () => {
  it("waits for the committed pathname instead of the in-flight target", () => {
    expect(isWaitlistPagePath("/")).toBe(false);
    expect(isWaitlistPagePath("/waitlist")).toBe(true);
  });
});

describe("isWaitlistMarketingPublicPath", () => {
  it("allows marketing and gate pages", () => {
    expect(isWaitlistMarketingPublicPath("/")).toBe(true);
    expect(isWaitlistMarketingPublicPath("/terms")).toBe(true);
    expect(isWaitlistMarketingPublicPath("/privacy")).toBe(true);
    expect(isWaitlistMarketingPublicPath("/waitlist")).toBe(true);
  });

  it("blocks product and admin pages (admin uses gate-bypass helper)", () => {
    expect(isWaitlistMarketingPublicPath("/projects")).toBe(false);
    expect(isWaitlistMarketingPublicPath("/projects/abc")).toBe(false);
    expect(isWaitlistMarketingPublicPath("/profile")).toBe(false);
    expect(isWaitlistMarketingPublicPath("/support")).toBe(false);
    expect(isWaitlistMarketingPublicPath("/support/abc")).toBe(false);
    expect(isWaitlistMarketingPublicPath("/admin")).toBe(false);
  });
});

describe("isWaitlistGateBypassPath", () => {
  it("includes marketing + admin", () => {
    expect(isWaitlistGateBypassPath("/")).toBe(true);
    expect(isWaitlistGateBypassPath("/waitlist")).toBe(true);
    expect(isWaitlistGateBypassPath("/admin")).toBe(true);
    expect(isWaitlistGateBypassPath("/admin/waitlist")).toBe(true);
  });

  it("allows /profile and /support (incl. ticket threads)", () => {
    expect(isWaitlistGateBypassPath("/profile")).toBe(true);
    expect(isWaitlistGateBypassPath("/support")).toBe(true);
    expect(isWaitlistGateBypassPath("/support/abc")).toBe(true);
  });

  it("still blocks product routes", () => {
    expect(isWaitlistGateBypassPath("/projects")).toBe(false);
    expect(isWaitlistGateBypassPath("/projects/abc")).toBe(false);
    expect(isWaitlistGateBypassPath("/projects/new")).toBe(false);
  });
});
