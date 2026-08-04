import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminMock,
  prismaUserFindUniqueMock,
  prismaUserUpdateMock,
  prismaProjectDeploymentFindManyMock,
  stopDeploymentMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(async () => ({ ok: true })),
  prismaUserFindUniqueMock: vi.fn(),
  prismaUserUpdateMock: vi.fn(),
  prismaProjectDeploymentFindManyMock: vi.fn(),
  stopDeploymentMock: vi.fn(async () => "stopped" as const),
}));

vi.mock("@/lib/auth-admin", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectDeployment: { findMany: prismaProjectDeploymentFindManyMock },
    user: {
      findUnique: prismaUserFindUniqueMock,
      update: prismaUserUpdateMock,
    },
  },
}));
vi.mock("@/lib/email/templates", () => ({
  sendBannedNotification: vi.fn(async () => undefined),
  sendUnbannedNotification: vi.fn(async () => undefined),
}));
vi.mock("@/lib/projects/runtime-supervisor", () => ({
  getRuntimeSupervisor: () => ({ stopDeployment: stopDeploymentMock }),
}));

import { getHandler } from "../../tests/routes/_handler";

import { Route, parseAdminEnergyGrant } from "@/routes/api.admin.users.$id";

const POST = getHandler(
  Route as never as Parameters<typeof getHandler>[0],
  "POST",
);

describe("parseAdminEnergyGrant", () => {
  it("accepts an integer grant in range", () => {
    expect(parseAdminEnergyGrant({ amount: 500_000 })).toEqual({
      ok: true,
      amount: 500_000,
    });
  });

  it.each([0, 2_000_001, 1.5, "500000", null])(
    "rejects invalid amount %j",
    (amount) => {
      expect(parseAdminEnergyGrant({ amount })).toEqual({
        ok: false,
        message: "amount harus bilangan bulat antara 1 dan 2.000.000.",
      });
    },
  );
});

describe("admin user ban action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ ok: true });
  });

  it("stops the user's published deployments when banning", async () => {
    prismaUserFindUniqueMock.mockResolvedValue({
      email: "user@example.com",
      name: "Budi",
    });
    prismaProjectDeploymentFindManyMock.mockResolvedValue([
      { id: "deployment_a" },
      { id: "deployment_b" },
    ]);

    const res = await POST(
      new Request("http://localhost/api/admin/users/user_1?action=ban"),
      { id: "user_1" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "banned" });
    expect(prismaUserUpdateMock).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { bannedAt: expect.any(Date) },
    });
    expect(stopDeploymentMock).toHaveBeenCalledWith("deployment_a");
    expect(stopDeploymentMock).toHaveBeenCalledWith("deployment_b");
  });

  it("still bans when there are no published deployments", async () => {
    prismaUserFindUniqueMock.mockResolvedValue({ email: null, name: null });
    prismaProjectDeploymentFindManyMock.mockResolvedValue([]);

    const res = await POST(
      new Request("http://localhost/api/admin/users/user_1?action=ban"),
      { id: "user_1" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "banned" });
    expect(stopDeploymentMock).not.toHaveBeenCalled();
  });

  it("bans even if stopping a deployment fails", async () => {
    prismaUserFindUniqueMock.mockResolvedValue({ email: null, name: null });
    prismaProjectDeploymentFindManyMock.mockResolvedValue([
      { id: "deployment_a" },
    ]);
    stopDeploymentMock.mockRejectedValueOnce(new Error("boom"));

    const res = await POST(
      new Request("http://localhost/api/admin/users/user_1?action=ban"),
      { id: "user_1" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "banned" });
  });
});
