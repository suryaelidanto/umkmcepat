import { describe, expect, it } from "vitest";

import { resolveWaitlistView } from "./waitlist-view";

describe("resolveWaitlistView", () => {
  it("lets approved status override a local submitted flag", () => {
    expect(
      resolveWaitlistView({
        effectiveStatus: "approved",
        ownStatus: "pending",
        submitted: true,
      }),
    ).toBe("approval");
  });

  it("lets rejection override a local submitted flag", () => {
    expect(
      resolveWaitlistView({
        effectiveStatus: null,
        ownStatus: "rejected",
        submitted: true,
      }),
    ).toBe("form");
  });

  it("keeps a pending entry on the thank-you screen", () => {
    expect(
      resolveWaitlistView({
        effectiveStatus: null,
        ownStatus: "pending",
        submitted: false,
      }),
    ).toBe("success");
  });

  it("keeps the submitted fallback while the first fresh response is empty", () => {
    expect(
      resolveWaitlistView({
        effectiveStatus: null,
        ownStatus: null,
        submitted: true,
      }),
    ).toBe("success");
  });

  it("uses the form when there is no entry", () => {
    expect(
      resolveWaitlistView({
        effectiveStatus: null,
        ownStatus: null,
        submitted: false,
      }),
    ).toBe("form");
  });
});
