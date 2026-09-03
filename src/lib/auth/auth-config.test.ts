import { beforeEach, describe, expect, it, vi } from "vitest";

import type { JWT } from "@auth/core/jwt";
import type { User } from "@auth/core/types";

const prismaUserFindUniqueMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => prismaUserFindUniqueMock(...args),
    },
  },
}));

import { authConfig } from "@/lib/auth/auth-config";

describe("authConfig stale JWT handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the JWT has no user subject", async () => {
    const jwtCallback = authConfig.callbacks?.jwt;
    expect(typeof jwtCallback).toBe("function");
    if (!jwtCallback) {
      return;
    }

    const result = await jwtCallback({
      token: {} as JWT,
      user: undefined as unknown as User,
    });

    expect(result).toBeNull();
    expect(prismaUserFindUniqueMock).not.toHaveBeenCalled();
  });

  it("returns null when the JWT user no longer exists", async () => {
    prismaUserFindUniqueMock.mockResolvedValue(null);

    const jwtCallback = authConfig.callbacks?.jwt;
    expect(typeof jwtCallback).toBe("function");
    if (!jwtCallback) {
      return;
    }

    const result = await jwtCallback({
      token: { sub: "deleted-user" } as JWT,
      user: undefined as unknown as User,
    });

    expect(result).toBeNull();
    expect(prismaUserFindUniqueMock).toHaveBeenCalledWith({
      select: { email: true, id: true, name: true },
      where: { id: "deleted-user" },
    });
  });

  it("returns null when the JWT user lookup fails", async () => {
    prismaUserFindUniqueMock.mockRejectedValue(new Error("database down"));

    const jwtCallback = authConfig.callbacks?.jwt;
    expect(typeof jwtCallback).toBe("function");
    if (!jwtCallback) {
      return;
    }

    const result = await jwtCallback({
      token: { sub: "user-1" } as JWT,
      user: undefined as unknown as User,
    });

    expect(result).toBeNull();
  });
});
