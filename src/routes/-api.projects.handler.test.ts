import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  checkRateLimitMock,
  executeRawMock,
  queryRawMock,
  moderateProjectRequestMock,
  prismaProjectCreateMock,
  prismaProjectFindManyMock,
  transactionMock,
} = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<unknown>>(async () => ({
    user: { id: "user_1" },
    expires: new Date().toISOString(),
  })),
  checkRateLimitMock: vi.fn(async () => null),
  executeRawMock: vi.fn(async () => 1),
  queryRawMock: vi.fn<() => Promise<Array<{ id: string }>>>(async () => []),
  moderateProjectRequestMock: vi.fn(async () => ({ allowed: true })),
  prismaProjectCreateMock: vi.fn(async () => ({ id: "project_1" })),
  prismaProjectFindManyMock: vi.fn<
    () => Promise<
      Array<{
        buildStatus: string;
        id: string;
        title: string;
        updatedAt: Date;
      }>
    >
  >(async () => []),
  transactionMock: vi.fn(async (callback) =>
    callback({
      $executeRaw: executeRawMock,
      $queryRaw: vi.fn(async () => [{ count: 0 }]),
      project: { create: prismaProjectCreateMock },
    }),
  ),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
}));
vi.mock("@/lib/ai-models", () => ({
  getDefaultAiModel: () => "test/model",
  getModerationModel: () => "test/moderation-model",
  getDiscussModel: () => "test/model",
  getGenerationModel: () => "test/model",
}));
vi.mock("@/lib/ai-moderation", () => ({
  moderateProjectRequest: moderateProjectRequestMock,
}));
vi.mock("@/lib/projects/input", async () => {
  const actual = await vi.importActual<typeof import("@/lib/projects/input")>(
    "@/lib/projects/input",
  );

  return { validateProjectRequest: actual.validateProjectRequest };
});
vi.mock("@/lib/projects/workspace", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/projects/workspace")
  >("@/lib/projects/workspace");

  return { getProjectTitle: actual.getProjectTitle };
});
vi.mock("@/lib/projects/project-asset-upload", () => ({
  uploadProjectAsset: vi.fn(async () => ({
    id: `asset_mock`,
  })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: queryRawMock,
    $transaction: transactionMock,
    project: {
      create: prismaProjectCreateMock,
      findMany: prismaProjectFindManyMock,
      count: vi.fn(async () => 0),
    },
    userCredit: {
      aggregate: vi.fn(async () => ({
        _sum: { amount: 0, inputTokens: 0, outputTokens: 0 },
      })),
      create: vi.fn(async () => ({ id: "credit_1" })),
    },
  },
}));
vi.mock("@/lib/user-credits", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/user-credits")>(
      "@/lib/user-credits",
    );

  return {
    ...actual,
    checkEnergy: vi.fn(async () => ({ allowed: true, remaining: 200_000 })),
    addEnergyUsage: vi.fn(async () => ({
      energyUsed: 0,
      inputTokens: 0,
      outputTokens: 0,
    })),
    chargeEnergyForAiUsage: vi.fn(async () => ({
      energyUsed: 0,
      inputTokens: 0,
      outputTokens: 0,
    })),
  };
});
vi.mock("@/lib/projects/brief-flow", () => ({
  createFallbackWorkspaceCard: vi.fn(() => ({
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

import { getHandler } from "../../tests/support/route-handler";

import { Route } from "@/routes/api.projects";

const GET = getHandler(Route, "GET");
const POST = getHandler(Route, "POST");

describe("projects route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    });
    checkRateLimitMock.mockResolvedValue(null);
    executeRawMock.mockResolvedValue(1);
    queryRawMock.mockResolvedValue([]);
    moderateProjectRequestMock.mockResolvedValue({
      allowed: true,
    });
    prismaProjectCreateMock.mockResolvedValue({ id: "project_1" });
    prismaProjectFindManyMock.mockResolvedValue([]);
    transactionMock.mockImplementation(async (callback) =>
      callback({
        $executeRaw: executeRawMock,
        $queryRaw: vi.fn(async () => [{ count: 0 }]),
        project: { create: prismaProjectCreateMock },
      }),
    );
  });

  it("uses a stable updatedAt and id keyset cursor", async () => {
    const timestamp = new Date("2026-07-10T01:00:00.000Z");
    prismaProjectFindManyMock.mockResolvedValue([
      {
        buildStatus: "passed",
        id: "project_7",
        title: "G",
        updatedAt: timestamp,
      },
      {
        buildStatus: "passed",
        id: "project_6",
        title: "F",
        updatedAt: timestamp,
      },
      {
        buildStatus: "passed",
        id: "project_5",
        title: "E",
        updatedAt: timestamp,
      },
      {
        buildStatus: "passed",
        id: "project_4",
        title: "D",
        updatedAt: timestamp,
      },
      {
        buildStatus: "passed",
        id: "project_3",
        title: "C",
        updatedAt: timestamp,
      },
      {
        buildStatus: "passed",
        id: "project_2",
        title: "B",
        updatedAt: timestamp,
      },
      {
        buildStatus: "passed",
        id: "project_1",
        title: "A",
        updatedAt: timestamp,
      },
    ]);

    const firstResponse = await GET(
      new Request("http://localhost/api/projects"),
    );
    const firstBody = await firstResponse.json();

    expect(firstBody.projects).toHaveLength(6);
    expect(firstBody.nextCursor).toEqual(expect.any(String));
    expect(prismaProjectFindManyMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
    );

    prismaProjectFindManyMock.mockResolvedValue([]);
    const secondResponse = await GET(
      new Request(
        `http://localhost/api/projects?cursor=${encodeURIComponent(firstBody.nextCursor)}`,
      ),
    );

    expect(secondResponse.status).toBe(200);
    expect(prismaProjectFindManyMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { updatedAt: { lt: timestamp } },
            { updatedAt: timestamp, id: { lt: "project_2" } },
          ],
        }),
      }),
    );
  });

  it("requires login", async () => {
    authMock.mockResolvedValueOnce(null);

    const formData = new FormData();
    formData.append("prompt", "Saya jual kopi");

    const response = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects oversized files (exceeding 5 MB) before moderation or database work", async () => {
    const formData = new FormData();
    formData.append("prompt", "Saya jual kopi susu");
    const largeFile = new File(
      [new Uint8Array(5 * 1024 * 1024 + 1)],
      "heavy.png",
      {
        type: "image/png",
      },
    );
    formData.append("files", largeFile);

    const response = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.message).toBe("Ukuran file melebihi 5 MB.");
    expect(moderateProjectRequestMock).not.toHaveBeenCalled();
    expect(prismaProjectCreateMock).not.toHaveBeenCalled();
  });

  it("rejects invalid prompt before moderation", async () => {
    const formData = new FormData();
    formData.append("prompt", " ");

    const response = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(400);
    expect(moderateProjectRequestMock).not.toHaveBeenCalled();
  });

  it("creates a project for the signed-in user", async () => {
    const formData = new FormData();
    formData.append("prompt", "Saya jual kopi susu");

    const response = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: "project_1",
      path: "/projects/project_1",
      assetIds: [],
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
    const formData = new FormData();
    formData.append("prompt", "Saya jual kopi susu");
    formData.append("mode", "build");

    await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: formData,
      }),
    );

    expect(prismaProjectCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "draft" }),
      }),
    );
  });

  it("returns a retryable failure when moderation provider fails", async () => {
    moderateProjectRequestMock.mockRejectedValueOnce(
      new Error("provider down"),
    );

    const formData = new FormData();
    formData.append("prompt", "Saya jual kopi susu");

    const response = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "moderation_unavailable",
    });
    expect(prismaProjectCreateMock).not.toHaveBeenCalled();
  });

  it("returns existing project for an idempotency key", async () => {
    queryRawMock.mockResolvedValueOnce([{ id: "project_existing" }]);

    const formData = new FormData();
    formData.append("prompt", "Saya jual kopi susu");
    formData.append("idempotencyKey", "draft-1");

    const response = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "project_existing",
      path: "/projects/project_existing",
      assetIds: [],
    });
    expect(prismaProjectCreateMock).not.toHaveBeenCalled();
  });

  it("stores an idempotency key with the created project", async () => {
    const formData = new FormData();
    formData.append("prompt", "Saya jual kopi susu");
    formData.append("idempotencyKey", "draft-1");

    const response = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    expect(executeRawMock).toHaveBeenCalled();
  });
});
