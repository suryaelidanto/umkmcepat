import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAuthStateMock = vi.fn();
const isAdminEmailMock = vi.fn();
const isWaitlistApprovedMock = vi.fn();
const isWaitlistEnabledMock = vi.fn();
const resolveUserWaitlistStatusMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthState: (...args: unknown[]) => getAuthStateMock(...args),
}));

vi.mock("@/lib/waitlist", () => ({
  isAdminEmail: (...args: unknown[]) => isAdminEmailMock(...args),
  isWaitlistApproved: (...args: unknown[]) => isWaitlistApprovedMock(...args),
}));

vi.mock("@/lib/waitlist-enabled", () => ({
  isWaitlistEnabled: (...args: unknown[]) => isWaitlistEnabledMock(...args),
}));

vi.mock("@/routes/api.user.waitlist", () => ({
  resolveUserWaitlistStatus: (...args: unknown[]) =>
    resolveUserWaitlistStatusMock(...args),
}));

const { checkRouteGates } = await import("./check-route-gates");

describe("checkRouteGates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminEmailMock.mockReturnValue(false);
    isWaitlistEnabledMock.mockResolvedValue(false);
    isWaitlistApprovedMock.mockResolvedValue(null);
    resolveUserWaitlistStatusMock.mockReturnValue({ status: "approved" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects banned users to /blocked for non-blocked pages", async () => {
    getAuthStateMock.mockResolvedValue({
      session: { user: { id: "u-1" } },
      banned: true,
    });

    await expect(checkRouteGates("/")).rejects.toBeInstanceOf(Response);
  });

  // Regression: ERR_TOO_MANY_REDIRECTS. The gate must NOT redirect banned users
  // to /blocked when they are already on /blocked, otherwise the gate's
  // redirect loops with itself.
  it("does not redirect banned users when already on /blocked", async () => {
    getAuthStateMock.mockResolvedValue({
      session: { user: { id: "u-1" } },
      banned: true,
    });

    const result = await checkRouteGates("/blocked");
    expect(result).toEqual({ ok: true });
  });

  // Regression: a banned user on /blocked must short-circuit for banned
  // users and not run the waitlist checks against their session user id.
  it("does not run waitlist checks for banned users on /blocked", async () => {
    getAuthStateMock.mockResolvedValue({
      session: { user: { id: "ghost" } },
      banned: true,
    });

    const result = await checkRouteGates("/blocked");

    expect(result).toEqual({ ok: true });
    expect(isWaitlistEnabledMock).not.toHaveBeenCalled();
    expect(isWaitlistApprovedMock).not.toHaveBeenCalled();
  });

  it("passes through for guests on public routes", async () => {
    getAuthStateMock.mockResolvedValue({ session: null, banned: false });

    const result = await checkRouteGates("/privacy");
    expect(result).toEqual({ ok: true });
  });

  it("allows waitlisted users on homepage", async () => {
    getAuthStateMock.mockResolvedValue({
      session: { user: { id: "u-1", email: "user@example.com" } },
      banned: false,
    });
    isWaitlistEnabledMock.mockResolvedValue(true);
    isWaitlistApprovedMock.mockResolvedValue(false);
    resolveUserWaitlistStatusMock.mockReturnValue({ status: "pending" });

    await expect(checkRouteGates("/")).resolves.toEqual({ ok: true });
  });

  it("still redirects waitlisted users away from product routes", async () => {
    getAuthStateMock.mockResolvedValue({
      session: { user: { id: "u-1", email: "user@example.com" } },
      banned: false,
    });
    isWaitlistEnabledMock.mockResolvedValue(true);
    isWaitlistApprovedMock.mockResolvedValue(false);
    resolveUserWaitlistStatusMock.mockReturnValue({ status: "pending" });

    await expect(checkRouteGates("/projects")).rejects.toBeInstanceOf(Response);
  });

  it("lets waitlisted users reach /admin (requireAdmin enforces real admin)", async () => {
    getAuthStateMock.mockResolvedValue({
      session: { user: { id: "u-1", email: "user@example.com" } },
      banned: false,
    });
    resolveUserWaitlistStatusMock.mockReturnValue({ status: "pending" });

    await expect(checkRouteGates("/admin")).resolves.toEqual({ ok: true });
    await expect(checkRouteGates("/admin/waitlist")).resolves.toEqual({
      ok: true,
    });
    expect(resolveUserWaitlistStatusMock).not.toHaveBeenCalled();
  });

  it("still waitlist-blocks waitlisted admins on product routes", async () => {
    getAuthStateMock.mockResolvedValue({
      session: { user: { id: "admin-1", email: "admin@example.com" } },
      banned: false,
    });
    isAdminEmailMock.mockReturnValue(true);
    isWaitlistEnabledMock.mockResolvedValue(true);
    isWaitlistApprovedMock.mockResolvedValue(false);
    resolveUserWaitlistStatusMock.mockReturnValue({ status: "pending" });

    await expect(checkRouteGates("/projects")).rejects.toBeInstanceOf(Response);
  });

  it("redirects signed-in non-approved users to waitlist without verification", async () => {
    getAuthStateMock.mockResolvedValue({
      session: { user: { id: "user_1", email: "owner@example.com" } },
      banned: false,
    });
    isWaitlistEnabledMock.mockResolvedValue(true);
    isWaitlistApprovedMock.mockResolvedValue(null);
    resolveUserWaitlistStatusMock.mockReturnValue({ status: "pending" });

    await expect(checkRouteGates("/projects/new")).rejects.toBeInstanceOf(
      Response,
    );
  });

  it("allows signed-in approved users through product routes", async () => {
    getAuthStateMock.mockResolvedValue({
      session: { user: { id: "user_1", email: "owner@example.com" } },
      banned: false,
    });
    isWaitlistEnabledMock.mockResolvedValue(true);
    isWaitlistApprovedMock.mockResolvedValue(true);
    resolveUserWaitlistStatusMock.mockReturnValue({ status: "approved" });

    await expect(checkRouteGates("/projects/new")).resolves.toEqual({
      ok: true,
    });
  });
});
