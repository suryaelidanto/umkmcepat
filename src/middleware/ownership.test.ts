import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaProjectFindFirstMock } = vi.hoisted(() => ({
  prismaProjectFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: prismaProjectFindFirstMock,
    },
  },
}));

import { verifyProjectOwnership } from "./ownership";

describe("verifyProjectOwnership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return true when a matching project is found", async () => {
    prismaProjectFindFirstMock.mockResolvedValue({ id: "proj_123" });

    const result = await verifyProjectOwnership("proj_123", "user_456");

    expect(prismaProjectFindFirstMock).toHaveBeenCalledWith({
      where: { id: "proj_123", userId: "user_456" },
      select: { id: true },
    });
    expect(result).toBe(true);
  });

  it("should return false when project is not found", async () => {
    prismaProjectFindFirstMock.mockResolvedValue(null);

    const result = await verifyProjectOwnership("proj_123", "user_456");

    expect(result).toBe(false);
  });

  it("should return false on empty inputs without calling db", async () => {
    const result1 = await verifyProjectOwnership("", "user_456");
    const result2 = await verifyProjectOwnership("proj_123", "");
    const result3 = await verifyProjectOwnership("", "");

    expect(prismaProjectFindFirstMock).not.toHaveBeenCalled();
    expect(result1).toBe(false);
    expect(result2).toBe(false);
    expect(result3).toBe(false);
  });

  it("should return false when database query throws an error", async () => {
    prismaProjectFindFirstMock.mockRejectedValue(
      new Error("DB Connection Error"),
    );

    const result = await verifyProjectOwnership("proj_123", "user_456");

    expect(result).toBe(false);
  });
});
