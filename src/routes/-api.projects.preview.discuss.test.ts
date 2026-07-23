import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  checkRateLimitMock,
  moderateProjectRequestMock,
  prismaProjectFindFirstMock,
  prismaQueryRawMock,
  prismaExecuteRawMock,
  prismaTransactionMock,
  prismaUserFindUniqueMock,
  claimDiscussTurnMock,
  runDiscussTurnMock,
  subscribeProgressMock,
  readTurnStateMock,
  publishProgressMock,
  parseProjectChatMessagesMock,
  validateUIMessagesMock,
  isUserVerifiedMock,
  checkEnergyMock,
  chargeEnergyForAiUsageMock,
  markStaleProjectBuildsMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  moderateProjectRequestMock: vi.fn(),
  prismaProjectFindFirstMock: vi.fn(),
  prismaQueryRawMock: vi.fn(),
  prismaExecuteRawMock: vi.fn(),
  prismaTransactionMock: vi.fn(),
  prismaUserFindUniqueMock: vi.fn(),
  claimDiscussTurnMock: vi.fn(),
  runDiscussTurnMock: vi.fn(),
  subscribeProgressMock: vi.fn(),
  readTurnStateMock: vi.fn(),
  publishProgressMock: vi.fn(),
  parseProjectChatMessagesMock: vi.fn(),
  validateUIMessagesMock: vi.fn(),
  isUserVerifiedMock: vi.fn(),
  checkEnergyMock: vi.fn(),
  chargeEnergyForAiUsageMock: vi.fn(),
  markStaleProjectBuildsMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: prismaTransactionMock,
    $queryRaw: prismaQueryRawMock,
    $executeRaw: prismaExecuteRawMock,
    project: { findFirst: prismaProjectFindFirstMock },
    user: { findUnique: prismaUserFindUniqueMock },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
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
    isUserVerified: isUserVerifiedMock,
    checkEnergy: checkEnergyMock,
    chargeEnergyForAiUsage: chargeEnergyForAiUsageMock,
  };
});

vi.mock("@/lib/projects/stale-builds", () => ({
  markStaleProjectBuilds: markStaleProjectBuildsMock,
}));

vi.mock("@/lib/projects/discuss-turn", () => ({
  claimDiscussTurn: claimDiscussTurnMock,
}));

vi.mock("@/lib/projects/discuss-turn-worker", () => ({
  runDiscussTurn: runDiscussTurnMock,
}));

vi.mock("@/lib/projects/discuss-turn-pubsub", () => ({
  subscribeProgress: subscribeProgressMock,
  readTurnState: readTurnStateMock,
  publishProgress: publishProgressMock,
}));

vi.mock("@/lib/projects/chat-memory", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/projects/chat-memory")
  >("@/lib/projects/chat-memory");
  return {
    ...actual,
    parseProjectChatMessages: parseProjectChatMessagesMock,
  };
});

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    validateUIMessages: validateUIMessagesMock,
  };
});

async function callDiscussPost() {
  const { Route } = await import("./api.projects.preview");
  const handler = (
    Route as unknown as {
      options: {
        server: {
          handlers: { POST: (ctx: { request: Request }) => Promise<Response> };
        };
      };
    }
  ).options.server.handlers.POST;

  const body = {
    mode: "discuss",
    projectId: "p_test",
    messages: [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "Halo" }],
      },
    ],
  };
  const request = new Request("http://localhost/api/projects/preview", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return handler({ request });
}

describe("POST /api/projects/preview (discuss) — server-side turn flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "u_test" } });
    isUserVerifiedMock.mockResolvedValue(true);
    checkRateLimitMock.mockResolvedValue(null);
    moderateProjectRequestMock.mockResolvedValue({
      allowed: true,
      modelId: "umkmcepat-combo",
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    checkEnergyMock.mockResolvedValue({ allowed: true, remaining: 100_000 });
    chargeEnergyForAiUsageMock.mockResolvedValue(null);
    markStaleProjectBuildsMock.mockResolvedValue(0);
    prismaUserFindUniqueMock.mockResolvedValue({ verifiedAt: new Date() });
    prismaProjectFindFirstMock.mockResolvedValue({
      id: "p_test",
      prompt: "Jualan kue",
      model: "umkmcepat-combo",
      status: "ready",
      title: "Kue Lebaran",
      chatMessages: [],
      chatSummary: null,
      memoryFacts: null,
      brief: null,
      lastCompactedMessageCount: 0,
      userId: "u_test",
    });
    prismaQueryRawMock.mockResolvedValue([]);
    prismaExecuteRawMock.mockResolvedValue(1);
    prismaTransactionMock.mockImplementation(
      async (cb: (tx: unknown) => unknown) => cb({}),
    );
    parseProjectChatMessagesMock.mockImplementation((value: unknown) =>
      Array.isArray(value) ? (value as never) : [],
    );
    validateUIMessagesMock.mockImplementation(async ({ messages }) => messages);
    // Live channel by default; the worker publishes to it async.
    readTurnStateMock.mockReturnValue("live");
    // Default subscriber: immediately replay a text delta + finish so the tail
    // stream resolves without hanging.
    subscribeProgressMock.mockImplementation(
      (
        _turnId: string,
        onEvent: (e: { type: string; [k: string]: unknown }) => void,
      ) => {
        onEvent({ type: "text-start", id: "t1" });
        onEvent({
          type: "text-delta",
          id: "t1",
          textDelta: "Halo balik!",
        });
        onEvent({ type: "text-end", id: "t1" });
        onEvent({ type: "finish" });
        return () => {};
      },
    );
    // Detached worker returns a settled promise; the POST must not await it.
    runDiscussTurnMock.mockResolvedValue(undefined);
  });

  it("claims the turn + fires the detached worker + returns a tail stream that emits the worker's pub/sub deltas + finish", async () => {
    claimDiscussTurnMock.mockResolvedValue({
      claimed: true,
      turnId: "ct_live",
    });

    const response = await callDiscussPost();
    expect(response.status).toBe(200);
    expect(claimDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p_test",
        userId: "u_test",
        userMessageId: "u1",
      }),
    );
    // Detached: runDiscussTurn fired + NOT awaited by the POST handler.
    expect(runDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: "ct_live" }),
    );
    // Tail stream subscribed to the pub/sub channel.
    expect(subscribeProgressMock).toHaveBeenCalledWith(
      "ct_live",
      expect.any(Function),
    );

    // The tail stream body emits the replayed deltas + finish.
    const text = await response.text();
    expect(text).toContain("Halo balik!");
    expect(text).toContain("finish");
  });

  it("returns 409 project_chat_in_progress when a turn is already running", async () => {
    claimDiscussTurnMock.mockResolvedValue({
      claimed: false,
      turnId: null,
    });

    const response = await callDiscussPost();
    expect(response.status).toBe(409);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ code: "project_chat_in_progress" });
    // No worker fired, no subscriber opened.
    expect(runDiscussTurnMock).not.toHaveBeenCalled();
    expect(subscribeProgressMock).not.toHaveBeenCalled();
  });

  it("replays the persisted assistant reply on reconnect-after-restart (channel gone + turn succeeded)", async () => {
    claimDiscussTurnMock.mockResolvedValue({
      claimed: true,
      turnId: "ct_done",
    });
    // Channel gone (server restarted). The DB fallback path reads the turn
    // row + chatMessages + replays the last assistant message.
    readTurnStateMock.mockReturnValue("gone");
    prismaQueryRawMock.mockResolvedValue([
      {
        status: "succeeded",
        errorMessage: null,
        chatMessages: [
          {
            id: "u1",
            role: "user",
            parts: [{ type: "text", text: "Halo" }],
          },
          {
            id: "a1",
            role: "assistant",
            parts: [{ type: "text", text: "Halo balik dari DB!" }],
          },
        ],
      },
    ]);

    const response = await callDiscussPost();
    expect(response.status).toBe(200);
    // Worker still fired (the POST always claims + detaches), but the tail
    // stream reads from the DB, not the (gone) pub/sub channel.
    expect(prismaQueryRawMock).toHaveBeenCalled();
    const text = await response.text();
    // ponytail: SSE only emits a terminal `finish` for the succeeded case —
    // the client recovers the reply via `reloadLatestChat` (GET /chat), not
    // via raw parts (which `processUIMessageStream` would silently drop).
    expect(text).toContain("finish");
    expect(text).not.toContain("Halo balik dari DB!");
  });

  it("emits an error when the channel is gone + the turn stalled (running but lost to restart)", async () => {
    claimDiscussTurnMock.mockResolvedValue({
      claimed: true,
      turnId: "ct_stall",
    });
    readTurnStateMock.mockReturnValue("gone");
    prismaQueryRawMock.mockResolvedValue([
      {
        status: "running",
        errorMessage: null,
        chatMessages: [],
      },
    ]);

    const response = await callDiscussPost();
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("error");
    expect(text).toContain("turn_stalled");
  });
});
