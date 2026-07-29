import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAuthStateMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthState: (...args: unknown[]) => getAuthStateMock(...args),
}));

vi.mock("@/lib/auth-client", () => ({
  signOut: vi.fn(),
}));

import { loadBlocked } from "@/server/loaders/load-blocked";

describe("/blocked route loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects guests to /", async () => {
    getAuthStateMock.mockResolvedValue({ session: null, banned: false });

    try {
      await loadBlocked();
      expect.fail("expected loader to throw");
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(Response);
    }
  });

  it("redirects non-banned signed-in users to /", async () => {
    getAuthStateMock.mockResolvedValue({
      session: { user: { id: "u-1", email: "a@b.c" } },
      banned: false,
    });

    try {
      await loadBlocked();
      expect.fail("expected loader to throw");
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(Response);
    }
  });

  it("returns ok for banned users", async () => {
    getAuthStateMock.mockResolvedValue({
      session: { user: { id: "u-1", email: "a@b.c" } },
      banned: true,
    });

    const result = await loadBlocked();
    expect(result).toEqual({ ok: true });
  });
});
