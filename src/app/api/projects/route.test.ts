import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, moderateProjectRequestMock, prismaProjectCreateMock } =
  vi.hoisted(() => ({
    authMock: vi.fn<() => Promise<unknown>>(async () => ({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    })),
    moderateProjectRequestMock: vi.fn(async () => ({ allowed: true })),
    prismaProjectCreateMock: vi.fn(async () => ({ id: "project_1" })),
  }));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/ai-models", () => ({ getDefaultAiModel: () => "test/model" }));
vi.mock("@/lib/ai-moderation", () => ({
  moderateProjectRequest: moderateProjectRequestMock,
}));
vi.mock("@/lib/projects/input", async () => {
  const actual = await vi.importActual<
    typeof import("../../../lib/projects/input")
  >("../../../lib/projects/input");

  return { validateProjectRequest: actual.validateProjectRequest };
});
vi.mock("@/lib/projects/site-schema", async () => {
  const actual = await vi.importActual<
    typeof import("../../../lib/projects/site-schema")
  >("../../../lib/projects/site-schema");

  return {
    createFallbackProjectSiteSchema: actual.createFallbackProjectSiteSchema,
  };
});
vi.mock("@/lib/projects/workspace", async () => {
  const actual = await vi.importActual<
    typeof import("../../../lib/projects/workspace")
  >("../../../lib/projects/workspace");

  return { getProjectTitle: actual.getProjectTitle };
});
vi.mock("@/lib/prisma", () => ({
  prisma: { project: { create: prismaProjectCreateMock } },
}));
vi.mock("@/lib/projects/brief-flow", () => ({
  createPendingWorkspaceCard: vi.fn(() => ({
    type: "questions",
    questions: [
      {
        id: "offer",
        question: "Apa menu utama yang mau ditonjolkan?",
        options: [],
      },
    ],
  })),
}));

import { POST } from "./route";

describe("projects route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    });
    moderateProjectRequestMock.mockResolvedValue({ allowed: true });
    prismaProjectCreateMock.mockResolvedValue({ id: "project_1" });
  });

  it("requires login", async () => {
    authMock.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ prompt: "Saya jual kopi" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects invalid prompt before moderation", async () => {
    const response = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ prompt: " " }),
      }),
    );

    expect(response.status).toBe(400);
    expect(moderateProjectRequestMock).not.toHaveBeenCalled();
  });

  it("creates a project for the signed-in user", async () => {
    const response = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ prompt: "Saya jual kopi susu" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "project_1",
      path: "/projects/project_1",
    });
    expect(prismaProjectCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "discussing",
          userId: "user_1",
        }),
      }),
    );
  });

  it("marks build mode projects for generation", async () => {
    await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ mode: "build", prompt: "Saya jual kopi susu" }),
      }),
    );

    expect(prismaProjectCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "draft" }),
      }),
    );
  });
});
