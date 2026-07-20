import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaTransactionMock,
  prismaProjectCreateMock,
  prismaProjectFindFirstMock,
  prismaProjectCountMock,
  prismaQueryRawMock,
  prismaExecuteRawMock,
  authMock,
  checkRateLimitMock,
  moderateProjectRequestMock,
  chargeEnergyForAiUsageMock,
  checkEnergyMock,
} = vi.hoisted(() => ({
  prismaTransactionMock: vi.fn(),
  prismaProjectCreateMock: vi.fn(),
  prismaProjectFindFirstMock: vi.fn(),
  prismaProjectCountMock: vi.fn(),
  prismaQueryRawMock: vi.fn(),
  prismaExecuteRawMock: vi.fn(),
  authMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  moderateProjectRequestMock: vi.fn(),
  chargeEnergyForAiUsageMock: vi.fn(),
  checkEnergyMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: prismaTransactionMock,
    project: {
      count: prismaProjectCountMock,
      create: prismaProjectCreateMock,
      findFirst: prismaProjectFindFirstMock,
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("@/lib/ai-moderation", () => ({
  moderateProjectRequest: moderateProjectRequestMock,
}));

vi.mock("@/lib/user-credits", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/user-credits")>(
      "@/lib/user-credits",
    );

  return {
    ...actual,
    chargeEnergyForAiUsage: chargeEnergyForAiUsageMock,
    checkEnergy: checkEnergyMock,
  };
});

const originalProjectLimit = process.env.PROJECT_LIMIT;

async function callPost(prompt = "Saya jualan kue") {
  const { Route } = await import("./api.projects");
  const handler = (
    Route as unknown as {
      options: {
        server: {
          handlers: { POST: (ctx: { request: Request }) => Promise<Response> };
        };
      };
    }
  ).options.server.handlers.POST;

  const request = new Request("http://localhost/api/projects", {
    body: JSON.stringify({ prompt }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  return handler({ request });
}

describe("POST /api/projects — project limit enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PROJECT_LIMIT = "3";
    authMock.mockResolvedValue({ user: { id: "u_test" } });
    checkRateLimitMock.mockResolvedValue(null);
    moderateProjectRequestMock.mockResolvedValue({
      allowed: true,
      modelId: "umkmcepat-combo",
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    chargeEnergyForAiUsageMock.mockResolvedValue(null);
    checkEnergyMock.mockResolvedValue({ allowed: true, remaining: 100_000 });
    prismaProjectFindFirstMock.mockResolvedValue(null);
    prismaProjectCountMock.mockResolvedValue(0);
    prismaExecuteRawMock.mockResolvedValue(1);

    // Default: $transaction just calls back with a fake tx that exposes
    // $queryRaw / $executeRaw / project.create. Individual tests override
    // prismaQueryRawMock / prismaProjectCreateMock to control the in-tx
    // behaviour.
    prismaTransactionMock.mockImplementation(async (callback) =>
      callback({
        $executeRaw: prismaExecuteRawMock,
        $queryRaw: prismaQueryRawMock,
        project: { create: prismaProjectCreateMock },
      }),
    );

    // Default: project.create returns a fake id. Overridden per-test.
    prismaProjectCreateMock.mockResolvedValue({ id: "p_new" });
  });

  afterEach(() => {
    if (originalProjectLimit === undefined) {
      delete process.env.PROJECT_LIMIT;
    } else {
      process.env.PROJECT_LIMIT = originalProjectLimit;
    }
  });

  it("rejects with 403 when count is already at the limit (no insert)", async () => {
    prismaQueryRawMock.mockResolvedValueOnce([{ count: 3 }]);

    const response = await callPost();
    expect(response.status).toBe(403);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      code: "project_limit_exceeded",
      projectCount: 3,
      projectLimit: 3,
    });
    expect(prismaProjectCreateMock).not.toHaveBeenCalled();
  });

  it("rejects with 403 when the user is already over the limit (legacy state)", async () => {
    prismaQueryRawMock.mockResolvedValueOnce([{ count: 5 }]);

    const response = await callPost();
    expect(response.status).toBe(403);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      code: "project_limit_exceeded",
      projectCount: 5,
      projectLimit: 3,
    });
    expect(prismaProjectCreateMock).not.toHaveBeenCalled();
  });

  it("creates a project when count is below the limit", async () => {
    prismaQueryRawMock.mockResolvedValueOnce([{ count: 2 }]);

    const response = await callPost();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ id: "p_new", path: "/projects/p_new" });
    expect(prismaProjectCreateMock).toHaveBeenCalledTimes(1);
  });

  it("does not call the non-transactional count before creating (no TOCTOU pre-check)", async () => {
    prismaQueryRawMock.mockResolvedValueOnce([{ count: 2 }]);

    await callPost();
    // The non-transactional prisma.project.count is only used by the
    // post-create info read (projectCount in the response body). If the
    // create succeeded, it should be called exactly once — and only after
    // the in-transaction $queryRaw gate, never before it.
    const txQueryOrder = prismaQueryRawMock.mock.invocationCallOrder[0] ?? 0;
    const countOrder = prismaProjectCountMock.mock.invocationCallOrder[0] ?? 0;
    expect(prismaProjectCountMock).toHaveBeenCalledTimes(1);
    expect(countOrder).toBeGreaterThan(txQueryOrder);
  });
});
