import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({ getEnv: () => "" }));

import { resolveUserWaitlistStatus } from "@/routes/api.user.waitlist";

describe("resolveUserWaitlistStatus", () => {
  it("toggle off -> pass-through (approved) for a signed-in non-admin", () => {
    const r = resolveUserWaitlistStatus({
      email: "user@example.com",
      isAdmin: false,
      isApproved: null,
      waitlistEnabled: false,
    });
    expect(r.status).toBe("approved");
  });

  it("toggle on + no entry -> null (gates to /waitlist)", () => {
    const r = resolveUserWaitlistStatus({
      email: "user@example.com",
      isAdmin: false,
      isApproved: null,
      waitlistEnabled: true,
    });
    expect(r.status).toBeNull();
  });

  it("toggle on + approved entry -> approved", () => {
    const r = resolveUserWaitlistStatus({
      email: "user@example.com",
      isAdmin: false,
      isApproved: "approved",
      waitlistEnabled: true,
    });
    expect(r.status).toBe("approved");
  });

  it("admin in non-dev env is approved regardless of entry status", () => {
    // NODE_ENV=test (set by vitest) is not "development", so the prod bypass fires.
    const r = resolveUserWaitlistStatus({
      email: "admin@example.com",
      isAdmin: true,
      isApproved: "pending",
      waitlistEnabled: true,
    });
    expect(r.status).toBe("approved");
  });

  it("admin in dev env is gated like a normal user", () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const r = resolveUserWaitlistStatus({
        email: "admin@example.com",
        isAdmin: true,
        isApproved: "pending",
        waitlistEnabled: true,
      });
      expect(r.status).toBeNull();
    } finally {
      process.env.NODE_ENV = orig;
    }
  });

  it("toggle on + non-admin + pending entry -> null (not yet approved)", () => {
    const r = resolveUserWaitlistStatus({
      email: "user@example.com",
      isAdmin: false,
      isApproved: "pending",
      waitlistEnabled: true,
    });
    expect(r.status).toBeNull();
  });

  it("toggle on + non-admin + rejected entry -> null (not approved)", () => {
    const r = resolveUserWaitlistStatus({
      email: "user@example.com",
      isAdmin: false,
      isApproved: "rejected",
      waitlistEnabled: true,
    });
    expect(r.status).toBeNull();
  });

  it("anonymous (no email) -> null (gate leaves them alone)", () => {
    const r = resolveUserWaitlistStatus({
      email: null,
      isAdmin: false,
      isApproved: null,
      waitlistEnabled: true,
    });
    expect(r.status).toBeNull();
  });
});
