import { afterEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();

vi.mock("@/lib/auth/auth-admin", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));

const { canUseDevTools, requireDevAdmin } = await import("./dev-admin");

describe("canUseDevTools", () => {
  it("true only when development and admin", () => {
    expect(canUseDevTools({ isDevelopment: true, isAdmin: true })).toBe(true);
    expect(canUseDevTools({ isDevelopment: true, isAdmin: false })).toBe(false);
    expect(canUseDevTools({ isDevelopment: false, isAdmin: true })).toBe(false);
    expect(canUseDevTools({ isDevelopment: false, isAdmin: false })).toBe(
      false,
    );
  });
});

describe("requireDevAdmin", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    requireAdminMock.mockReset();
  });

  it("returns 403 when not development", async () => {
    process.env.NODE_ENV = "production";
    await expect(requireDevAdmin()).resolves.toEqual({
      ok: false,
      status: 403,
      message: "Endpoint ini hanya tersedia di mode development.",
    });
    expect(requireAdminMock).not.toHaveBeenCalled();
  });

  it("delegates to requireAdmin in development", async () => {
    process.env.NODE_ENV = "development";
    requireAdminMock.mockResolvedValueOnce({
      ok: true,
      admin: { email: "admin@example.com", userId: "u-1" },
    });
    await expect(requireDevAdmin()).resolves.toEqual({
      ok: true,
      admin: { email: "admin@example.com", userId: "u-1" },
    });
    expect(requireAdminMock).toHaveBeenCalledOnce();
  });

  it("passes through requireAdmin failure in development", async () => {
    process.env.NODE_ENV = "development";
    requireAdminMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      message: "Akses admin diperlukan.",
    });
    await expect(requireDevAdmin()).resolves.toEqual({
      ok: false,
      status: 403,
      message: "Akses admin diperlukan.",
    });
  });
});
