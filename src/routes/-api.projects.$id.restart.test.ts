import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  prismaProjectDeploymentFindFirstMock,
  prismaProjectFindFirstMock,
  startDeploymentMock,
  stopDeploymentMock,
} = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<unknown>>(),
  prismaProjectDeploymentFindFirstMock: vi.fn(),
  prismaProjectFindFirstMock: vi.fn(),
  startDeploymentMock: vi.fn(async () => "running" as const),
  stopDeploymentMock: vi.fn(async () => "stopped" as const),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: prismaProjectFindFirstMock },
    projectDeployment: { findFirst: prismaProjectDeploymentFindFirstMock },
  },
}));
vi.mock("@/lib/projects/runtime-supervisor", () => ({
  getRuntimeSupervisor: () => ({
    startDeployment: startDeploymentMock,
    stopDeployment: stopDeploymentMock,
  }),
}));

import { getHandler } from "../../tests/support/route-handler";

import { Route } from "@/routes/api.projects.$id.restart";

const POST = getHandler(Route, "POST");

describe("project restart route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user_1" } });
  });

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(undefined, { id: "project_1" });
    expect(res.status).toBe(401);
    expect(startDeploymentMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the caller is not the owner", async () => {
    prismaProjectFindFirstMock.mockResolvedValue(null);
    const res = await POST(undefined, { id: "project_1" });
    expect(res.status).toBe(404);
    expect(startDeploymentMock).not.toHaveBeenCalled();
  });

  it("returns 404 when there is no active preview deployment", async () => {
    prismaProjectFindFirstMock.mockResolvedValue({ id: "project_1" });
    prismaProjectDeploymentFindFirstMock.mockResolvedValue(null);
    const res = await POST(undefined, { id: "project_1" });
    expect(res.status).toBe(404);
    expect(stopDeploymentMock).not.toHaveBeenCalled();
  });

  it("stops then starts the active preview deployment for the owner", async () => {
    prismaProjectFindFirstMock.mockResolvedValue({ id: "project_1" });
    prismaProjectDeploymentFindFirstMock.mockResolvedValue({
      id: "deployment_1",
    });
    const res = await POST(undefined, { id: "project_1" });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(stopDeploymentMock).toHaveBeenCalledWith("deployment_1");
    expect(startDeploymentMock).toHaveBeenCalledWith("deployment_1");
  });
});
