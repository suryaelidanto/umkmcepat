import { describe, expect, it } from "vitest";

import { postVerifyDestination } from "./post-verify-destination";

describe("postVerifyDestination", () => {
  it('returns "/" when status is approved', () => {
    expect(postVerifyDestination("approved")).toBe("/");
  });

  it('returns "/waitlist" when status is null', () => {
    expect(postVerifyDestination(null)).toBe("/waitlist");
  });

  it('returns "/waitlist" when status is undefined', () => {
    expect(postVerifyDestination(undefined)).toBe("/waitlist");
  });

  it('returns "/waitlist" for pending / waitlisted / rejected / other', () => {
    expect(postVerifyDestination("pending")).toBe("/waitlist");
    expect(postVerifyDestination("waitlisted")).toBe("/waitlist");
    expect(postVerifyDestination("rejected")).toBe("/waitlist");
    expect(postVerifyDestination("weird")).toBe("/waitlist");
  });
});
