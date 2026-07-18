import { afterEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  checkRateLimitMock,
  claimProjectOperationMock,
  finalizeProjectOperationMock,
  markStaleProjectBuildsMock,
  prismaProjectBuildCreateMock,
  prismaProjectEditAttemptCreateMock,
  prismaProjectEditAttemptUpdateMock,
  prismaProjectEditAttemptUpdateManyMock,
  prismaProjectFindFirstMock,
  prismaProjectFindUniqueMock,
  prismaProjectSnapshotCreateMock,
  prismaQueryRawMock,
  stopSupersededPreviewDeploymentsMock,
  generateTextMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  checkRateLimitMock: vi.fn(async () => null),
  claimProjectOperationMock: vi.fn(async () => ({
    claimed: true,
    token: "operation-token",
  })),
  finalizeProjectOperationMock: vi.fn(async () => true),
  markStaleProjectBuildsMock: vi.fn(async () => undefined),
  prismaProjectBuildCreateMock: vi.fn(async () => ({ id: "build_early" })),
  prismaProjectEditAttemptCreateMock: vi.fn(async () => ({ id: "attempt_1" })),
  prismaProjectEditAttemptUpdateMock: vi.fn(async () => ({ id: "attempt_1" })),
  prismaProjectEditAttemptUpdateManyMock: vi.fn(async () => ({ count: 1 })),
  prismaProjectFindFirstMock: vi.fn(),
  prismaProjectFindUniqueMock: vi.fn(),
  prismaProjectSnapshotCreateMock: vi.fn(async () => ({
    id: "snapshot_early",
  })),
  prismaQueryRawMock: vi.fn(),
  stopSupersededPreviewDeploymentsMock: vi.fn(async () => []),
  generateTextMock: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  getAiModel: vi.fn(() => "test-model"),
  getAiTelemetry: vi.fn(() => ({ isEnabled: false })),
}));
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/dev-log", () => ({ devLog: vi.fn() }));
vi.mock("@/lib/projects/project-operation", () => ({
  claimProjectOperation: claimProjectOperationMock,
  finalizeProjectOperation: finalizeProjectOperationMock,
  renewProjectOperation: vi.fn(async () => true),
}));
vi.mock("@/lib/projects/runtime-supervisor", () => ({
  stopSupersededPreviewDeployments: stopSupersededPreviewDeploymentsMock,
}));
vi.mock("@/lib/projects/stale-builds", () => ({
  markStaleProjectBuilds: markStaleProjectBuildsMock,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: prismaProjectFindFirstMock,
      findUnique: prismaProjectFindUniqueMock,
    },
    projectBuild: {
      create: prismaProjectBuildCreateMock,
      update: vi.fn(async () => ({ id: "build_early" })),
    },
    projectEditAttempt: {
      create: prismaProjectEditAttemptCreateMock,
      update: prismaProjectEditAttemptUpdateMock,
      updateMany: prismaProjectEditAttemptUpdateManyMock,
    },
    projectSnapshot: {
      create: prismaProjectSnapshotCreateMock,
    },
    runtimeEvent: {
      create: vi.fn(async () => ({ id: "event_1" })),
    },
    $queryRaw: prismaQueryRawMock,
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
}));
vi.mock("@/lib/user-credits", () => ({
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
  MIN_ENERGY_BUILD: 40_000,
  isUserVerified: vi.fn(async () => true),
}));
vi.mock("ai", () => ({
  jsonSchema: vi.fn((schema: unknown) => schema),
  Output: {
    json: vi.fn(() => ({})),
    object: vi.fn((opts: unknown) => opts),
  },
  tool: vi.fn((opts: unknown) => opts),
  generateText: generateTextMock,
  streamText: vi.fn(),
}));

import { getHandler } from "./_handler";

import { Route } from "@/routes/api.projects.$id.generate";

const POST = getHandler(Route, "POST");

describe("project generate route", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("does not load or claim a project when generated builds are disabled", async () => {
    vi.stubEnv("GENERATED_BUILD_EXECUTION_ENABLED", "false");
    authMock.mockResolvedValue({
      expires: new Date().toISOString(),
      user: { id: "user_1" },
    });

    const response = await POST(
      new Request("http://localhost/api/projects/project_1/generate", {
        body: "{}",
        method: "POST",
      }),
      { id: "project_1" },
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe("generated_build_execution_unavailable");
    expect(prismaProjectFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns a stream error when model output fails during implementation spec generation", async () => {
    authMock.mockResolvedValue({
      expires: new Date().toISOString(),
      user: { id: "user_1" },
    });
    prismaProjectFindFirstMock
      .mockResolvedValueOnce({
        id: "project_1",
        buildStatus: "ready",
        prompt: "Saya jual bakso",
        status: "ready",
      })
      .mockResolvedValueOnce({
        id: "project_1",
        buildStatus: "ready",
        status: "ready",
      });
    prismaQueryRawMock.mockResolvedValueOnce([
      {
        brief: {
          confidence: 100,
          openQuestions: [],
        },
      },
    ]);
    generateTextMock.mockRejectedValueOnce(
      new Error(
        '[provider transport error: {"type":"server_error","message":"Network connection lost."}]',
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/projects/project_1/generate", {
        body: JSON.stringify({ force: true }),
        method: "POST",
      }),
      { id: "project_1" },
    );

    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("event: error");
    expect(body).toContain("AI belum bisa membangun website ini.");
    expect(body).not.toContain("[provider transport error:");
    expect(finalizeProjectOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          buildStatus: "failed",
          status: "failed",
        }),
      }),
    );
    expect(prismaProjectEditAttemptUpdateManyMock).toHaveBeenCalled();
  });
});
