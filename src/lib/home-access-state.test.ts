import { describe, expect, it } from "vitest";

import { resolveHomeAccessState } from "./home-access-state";

describe("resolveHomeAccessState", () => {
  it("keeps a signed-in homepage neutral until waitlist status is known", () => {
    expect(
      resolveHomeAccessState({
        authStatus: "authenticated",
        hasUser: true,
        hasWaitlistData: false,
        isApproved: false,
        waitlistStatus: "pending",
      }),
    ).toBe("loading");
  });

  it("shows the waitlisted homepage after a non-approved status arrives", () => {
    expect(
      resolveHomeAccessState({
        authStatus: "authenticated",
        hasUser: true,
        hasWaitlistData: true,
        isApproved: false,
        waitlistStatus: "success",
      }),
    ).toBe("waitlisted");
  });

  it("shows the product homepage after approval arrives", () => {
    expect(
      resolveHomeAccessState({
        authStatus: "authenticated",
        hasUser: true,
        hasWaitlistData: true,
        isApproved: true,
        waitlistStatus: "success",
      }),
    ).toBe("approved");
  });

  it("keeps the public homepage for guests", () => {
    expect(
      resolveHomeAccessState({
        authStatus: "unauthenticated",
        hasUser: false,
        hasWaitlistData: false,
        isApproved: false,
        waitlistStatus: "pending",
      }),
    ).toBe("guest");
  });

  it("does not show product content when the status request fails without data", () => {
    expect(
      resolveHomeAccessState({
        authStatus: "authenticated",
        hasUser: true,
        hasWaitlistData: false,
        isApproved: false,
        waitlistStatus: "error",
      }),
    ).toBe("error");
  });

  it("keeps last-known-good access while a refresh fails", () => {
    expect(
      resolveHomeAccessState({
        authStatus: "authenticated",
        hasUser: true,
        hasWaitlistData: true,
        isApproved: true,
        waitlistStatus: "error",
      }),
    ).toBe("approved");
  });
});
