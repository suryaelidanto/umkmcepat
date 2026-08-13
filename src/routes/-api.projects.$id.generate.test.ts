import { describe, expect, it, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => {
  const prismaMock = {
    project: { findFirst: vi.fn() },
    projectEditAttempt: { create: vi.fn() },
    projectSnapshot: { create: vi.fn() },
    projectBuild: { create: vi.fn() },
    projectBuildHandoff: { findUnique: vi.fn() },
  };
  return {
    prismaMock,
    authMock: vi.fn(),
    checkEnergyMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    claimMock: vi.fn(),
    handoffMocks: {
      acceptHandoffAndCreateAttempt: vi.fn(),
      loadActiveHandoff: vi.fn(),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: hoisted.prismaMock }));
vi.mock("@/lib/auth", () => ({ auth: hoisted.authMock }));
vi.mock("@/lib/user-credits", () => ({
  checkEnergy: hoisted.checkEnergyMock,
  getEnergyConfig: () => ({ minBuild: 1 }),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: hoisted.checkRateLimitMock,
}));
vi.mock("@/lib/config", () => ({
  isGeneratedBuildExecutionEnabled: () => true,
}));
vi.mock("@/lib/projects/project-operation", () => ({
  claimProjectOperation: hoisted.claimMock,
  finalizeProjectOperation: vi.fn(async () => true),
}));
vi.mock("@/lib/projects/load-persisted-project-source", () => ({
  loadPersistedProjectSourceFiles: async () => [],
}));
vi.mock("@/lib/projects/build-handoffs", () => ({
  loadActiveHandoff: hoisted.handoffMocks.loadActiveHandoff,
}));
vi.mock("@/lib/projects/build-handoff-acceptance", () => ({
  acceptHandoffAndCreateAttempt:
    hoisted.handoffMocks.acceptHandoffAndCreateAttempt,
}));
vi.mock("@/lib/projects/build-attempt-pubsub", () => ({
  createReadStreamFromChannel: () => new Response("ok"),
  publishBuildProgress: vi.fn(),
}));
vi.mock("@/lib/projects/attempt-queue", () => ({
  enqueueAttemptJob: async () => {},
}));
vi.mock("@/lib/projects/stale-builds", () => ({
  markStaleProjectBuilds: async () => {},
}));

// Import after mocks
import { handleGeneratePost } from "./api.projects.$id.generate";

async function callGenerate(body: unknown) {
  const req = new Request("http://x/api/projects/p1/generate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  return handleGeneratePost(req, "p1");
}

describe("POST /api/projects/$id/generate contract guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.authMock.mockResolvedValue({ user: { id: "u1" } });
    hoisted.checkEnergyMock.mockResolvedValue({ allowed: true, remaining: 10 });
    hoisted.checkRateLimitMock.mockResolvedValue(null);
    hoisted.claimMock.mockResolvedValue({ claimed: true, token: "op1" });
    hoisted.handoffMocks.loadActiveHandoff.mockResolvedValue(null);
    hoisted.prismaMock.project.findFirst
      .mockResolvedValueOnce({
        id: "p1",
        prompt: "x",
        status: "discussing",
        buildStatus: "not_started",
        generationEngine: "contract-v1",
      })
      .mockResolvedValueOnce({
        buildStatus: "not_started",
        status: "discussing",
      });
  });

  it("rejects contract request without handoff proof before claiming operation", async () => {
    const res = await callGenerate({});
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("project_handoff_required");
    expect(hoisted.claimMock).not.toHaveBeenCalled();
    expect(hoisted.prismaMock.projectEditAttempt.create).not.toHaveBeenCalled();
  });

  it("rejects stale review hash", async () => {
    hoisted.handoffMocks.acceptHandoffAndCreateAttempt.mockRejectedValue(
      new Error("review hash mismatch"),
    );
    const res = await callGenerate({
      handoffId: "h1",
      reviewHash: "stale",
      idempotencyKey: "k1",
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("project_handoff_required");
  });

  it("accepts valid handoff proof idempotently", async () => {
    hoisted.handoffMocks.acceptHandoffAndCreateAttempt.mockResolvedValue({
      created: false,
      existingAttemptId: "existing",
    });
    const res = await callGenerate({
      handoffId: "h1",
      reviewHash: "a".repeat(64),
      idempotencyKey: "k1",
    });
    expect(res.status).toBe(200);
  });
});
