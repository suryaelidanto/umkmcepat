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

  it("admin is always approved", () => {
    const r = resolveUserWaitlistStatus({
      email: "admin@example.com",
      isAdmin: true,
      isApproved: "pending",
      waitlistEnabled: true,
    });
    expect(r.status).toBe("approved");
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
