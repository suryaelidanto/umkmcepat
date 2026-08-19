import { afterEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  checkRateLimitMock,
  claimProjectOperationMock,
  enqueueAttemptJobMock,
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
  createReadStreamFromChannelMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  checkRateLimitMock: vi.fn(async () => null),
  claimProjectOperationMock: vi.fn(async () => ({
    claimed: true,
    token: "op_token",
  })),
  enqueueAttemptJobMock: vi.fn(async () => undefined),
  finalizeProjectOperationMock: vi.fn(async () => true),
  markStaleProjectBuildsMock: vi.fn(async () => 0),
  prismaProjectBuildCreateMock: vi.fn(async () => ({ id: "build_1" })),
  prismaProjectEditAttemptCreateMock: vi.fn(async () => ({ id: "attempt_1" })),
  prismaProjectEditAttemptUpdateMock: vi.fn(async () => ({ id: "attempt_1" })),
  prismaProjectEditAttemptUpdateManyMock: vi.fn(async () => ({ count: 1 })),
  prismaProjectFindFirstMock: vi.fn(),
  prismaProjectFindUniqueMock: vi.fn(),
  prismaProjectSnapshotCreateMock: vi.fn(async () => ({ id: "snap_1" })),
  prismaQueryRawMock: vi.fn(),
  stopSupersededPreviewDeploymentsMock: vi.fn(async () => []),
  createReadStreamFromChannelMock: vi.fn(
    () =>
      new Response("event: progress\ndata: {}\n\n", {
        headers: { "Content-Type": "text/event-stream" },
        status: 200,
      }),
  ),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/dev-log", () => ({ devLog: vi.fn() }));
vi.mock("@/lib/projects/project-operation", () => ({
  claimProjectOperation: claimProjectOperationMock,
  finalizeProjectOperation: finalizeProjectOperationMock,
}));
vi.mock("@/lib/projects/runtime-supervisor", () => ({
  stopSupersededPreviewDeployments: stopSupersededPreviewDeploymentsMock,
}));
vi.mock("@/lib/projects/stale-builds", () => ({
  markStaleProjectBuilds: markStaleProjectBuildsMock,
}));
vi.mock("@/lib/projects/load-persisted-project-source", () => ({
  loadPersistedProjectSourceFiles: vi.fn(async () => []),
  projectHasPersistedSource: vi.fn(async () => false),
}));
vi.mock("@/lib/projects/attempt-queue", () => ({
  enqueueAttemptJob: enqueueAttemptJobMock,
}));
vi.mock("@/lib/projects/build-attempt-pubsub", () => ({
  createReadStreamFromChannel: createReadStreamFromChannelMock,
  publishBuildProgress: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: prismaQueryRawMock,
    project: {
      findFirst: prismaProjectFindFirstMock,
      findUnique: prismaProjectFindUniqueMock,
    },
    projectBuild: {
      create: prismaProjectBuildCreateMock,
    },
    projectEditAttempt: {
      create: prismaProjectEditAttemptCreateMock,
      update: prismaProjectEditAttemptUpdateMock,
      updateMany: prismaProjectEditAttemptUpdateManyMock,
    },
    projectSnapshot: {
      create: prismaProjectSnapshotCreateMock,
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
}));
vi.mock("@/lib/user-credits", () => ({
  checkEnergy: vi.fn(async () => ({ allowed: true, remaining: 200_000 })),
  getEnergyConfig: vi.fn(() => ({ minBuild: 1 })),
  addEnergyUsage: vi.fn(async () => ({
    energyUsed: 0,
    inputTokens: 0,
    outputTokens: 0,
  })),
  chargeEnergyForAiUsage: vi.fn(async () => ({})),
}));

import { getHandler } from "../../tests/support/route-handler";

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

  it("returns unavailable when the attempt queue rejects the job", async () => {
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
    enqueueAttemptJobMock.mockRejectedValueOnce(new Error("redis down"));

    const response = await POST(
      new Request("http://localhost/api/projects/project_1/generate", {
        body: JSON.stringify({ force: true }),
        method: "POST",
      }),
      { id: "project_1" },
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe("build_attempt_unavailable");
    expect(finalizeProjectOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          buildStatus: "failed",
          status: "failed",
        }),
      }),
    );
    expect(createReadStreamFromChannelMock).not.toHaveBeenCalled();
  });
});
