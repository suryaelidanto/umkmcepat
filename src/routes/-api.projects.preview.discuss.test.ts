import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const previewRouteSource = readFileSync(
  new URL("./api.projects.preview.ts", import.meta.url),
  "utf8",
);

const {
  authMock,
  checkRateLimitMock,
  moderateProjectRequestMock,
  prismaProjectFindFirstMock,
  prismaQueryRawMock,
  prismaExecuteRawMock,
  prismaTransactionMock,
  claimDiscussTurnMock,
  enqueueAttemptJobMock,
  subscribeProgressMock,
  parseProjectChatMessagesMock,
  validateUIMessagesMock,
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
  claimDiscussTurnMock: vi.fn(),
  enqueueAttemptJobMock: vi.fn(),
  subscribeProgressMock: vi.fn(),
  parseProjectChatMessagesMock: vi.fn(),
  validateUIMessagesMock: vi.fn(),
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
  },
}));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/lib/ai/ai-moderation", () => ({
  moderateProjectRequest: moderateProjectRequestMock,
}));

vi.mock("@/lib/payment/user-credits", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/payment/user-credits")
  >("@/lib/payment/user-credits");
  return {
    ...actual,
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

vi.mock("@/lib/projects/attempt-queue", () => ({
  enqueueAttemptJob: enqueueAttemptJobMock,
}));

vi.mock("@/lib/projects/discuss-turn-pubsub", () => ({
  subscribeProgress: subscribeProgressMock,
  ensureProgressChannel: vi.fn(),
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

async function callPreflightPost(intent: "prepare_build" | "prepare_update") {
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
  const request = new Request("http://localhost/api/projects/preview", {
    body: JSON.stringify({
      intent,
      message: {
        id: "client-preflight",
        role: "user",
        parts: [{ type: "text", text: "" }],
      },
      mode: "discuss",
      projectId: "p_test",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return handler({ request });
}

describe("POST /api/projects/preview (discuss) — server-side turn flow", () => {
  it("does not retain a parallel-moderation admin toggle", () => {
    expect(previewRouteSource).not.toContain("discuss.parallel_moderation");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "u_test" } });
    checkRateLimitMock.mockResolvedValue(null);
    moderateProjectRequestMock.mockResolvedValue({
      allowed: true,
      modelId: "default-combo",
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    checkEnergyMock.mockResolvedValue({ allowed: true, remaining: 100_000 });
    chargeEnergyForAiUsageMock.mockResolvedValue(null);
    markStaleProjectBuildsMock.mockResolvedValue(0);
    prismaProjectFindFirstMock.mockResolvedValue({
      id: "p_test",
      prompt: "Jualan kue",
      model: "default-combo",
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
    subscribeProgressMock.mockImplementation(
      (
        _turnId: string,
        onEvent: (e: { type: string; [k: string]: unknown }) => void,
      ) => {
        onEvent({ type: "activity", phase: "responding" });
        onEvent({ type: "text-start", id: "t1" });
        onEvent({
          type: "text-delta",
          id: "t1",
          delta: "Halo balik!",
        });
        onEvent({ type: "text-end", id: "t1" });
        onEvent({ type: "finish" });
        return () => {};
      },
    );
    enqueueAttemptJobMock.mockResolvedValue(undefined);
  });

  it("claims the turn + enqueues discuss job + returns a tail stream that emits the worker's pub/sub deltas + finish", async () => {
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
    expect(enqueueAttemptJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "discuss", turnId: "ct_live" }),
    );
    // Tail stream subscribed to the pub/sub channel.
    expect(subscribeProgressMock).toHaveBeenCalledWith(
      "ct_live",
      expect.any(Function),
      { replayBuffered: false },
    );

    // The tail stream body emits only valid UI message chunks.
    const text = await response.text();
    expect(text).toContain("Halo balik!");
    expect(text).toContain("finish");
    expect(text).not.toContain('"type":"activity"');
  });

  it("submits first: persists, claims, and enqueues without moderating in the route", async () => {
    const order: string[] = [];
    claimDiscussTurnMock.mockImplementation(async () => {
      order.push("claim");
      return { claimed: true, turnId: "ct_submit_first" };
    });
    enqueueAttemptJobMock.mockImplementation(async () => {
      order.push("enqueue");
    });

    const response = await callDiscussPost();

    expect(response.status).toBe(200);
    // The discuss worker owns moderation; the route never calls it.
    expect(moderateProjectRequestMock).not.toHaveBeenCalled();
    expect(order).toEqual(["claim", "enqueue"]);
  });

  it("rejects duplicate preflight while a workspace question awaits an answer", async () => {
    prismaProjectFindFirstMock.mockResolvedValue({
      id: "p_test",
      prompt: "Jualan kue",
      status: "discussing",
      buildStatus: "not_started",
      buildCheckpoints: [],
      builds: [],
      title: "Kue Lebaran",
      userId: "u_test",
    });
    prismaQueryRawMock.mockResolvedValue([
      {
        chatMessages: [],
        chatSummary: null,
        memoryFacts: null,
        lastCompactedMessageCount: 0,
        brief: null,
        workspaceCard: {
          type: "question",
          question: {
            id: "business_type",
            question: "Usaha kamu termasuk jenis apa?",
            options: [],
          },
        },
      },
    ]);

    const response = await callPreflightPost("prepare_build");

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "workspace_answer_required",
    });
    expect(claimDiscussTurnMock).not.toHaveBeenCalled();
    expect(enqueueAttemptJobMock).not.toHaveBeenCalled();
  });

  it("starts an empty update preflight without persisting a synthetic user message", async () => {
    prismaProjectFindFirstMock.mockResolvedValue({
      id: "p_test",
      prompt: "Jualan kue",
      status: "failed",
      buildStatus: "canceled",
      buildCheckpoints: [
        {
          chatMessageId: "checkpoint-message",
          chatMessageIndex: 0,
          id: "checkpoint_1",
        },
      ],
      builds: [],
      title: "Kue Lebaran",
      userId: "u_test",
    });
    prismaQueryRawMock.mockResolvedValue([
      {
        chatMessages: [
          {
            id: "checkpoint-message",
            role: "assistant",
            parts: [{ type: "text", text: "Website selesai." }],
          },
          {
            id: "pending-message",
            role: "user",
            parts: [{ type: "text", text: "Ubah warna tombol." }],
          },
        ],
        chatSummary: null,
        memoryFacts: null,
        lastCompactedMessageCount: 0,
        brief: null,
        workspaceCard: { type: "none" },
      },
    ]);
    claimDiscussTurnMock.mockResolvedValue({
      claimed: true,
      turnId: "ct_preflight",
    });

    const response = await callPreflightPost("prepare_update");

    expect(response.status).toBe(200);
    expect(prismaExecuteRawMock).not.toHaveBeenCalled();
    expect(
      validateUIMessagesMock.mock.calls[0]?.[0]?.messages.map(
        (message: { id: string }) => message.id,
      ),
    ).toEqual(["checkpoint-message", "pending-message"]);
    expect(claimDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p_test",
        userId: "u_test",
        userMessageId: expect.stringMatching(/^preflight-update-/),
      }),
    );
    expect(enqueueAttemptJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "discuss",
        turnId: "ct_preflight",
        preflight: "update",
        hasBuiltSite: true,
        hasPendingUpdate: true,
        pendingUpdateInstructions: "Ubah warna tombol.",
      }),
    );
  });

  it("starts an empty first-build preflight without starting a build job", async () => {
    prismaProjectFindFirstMock.mockResolvedValue({
      id: "p_test",
      prompt: "Jualan kue",
      status: "draft",
      buildStatus: "not_started",
      buildCheckpoints: [],
      builds: [],
      title: "Kue Lebaran",
      userId: "u_test",
    });
    claimDiscussTurnMock.mockResolvedValue({
      claimed: true,
      turnId: "ct_build_preflight",
    });

    const response = await callPreflightPost("prepare_build");

    expect(response.status).toBe(200);
    expect(enqueueAttemptJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "discuss",
        turnId: "ct_build_preflight",
        preflight: "build",
        hasBuiltSite: false,
      }),
    );
    expect(prismaExecuteRawMock).not.toHaveBeenCalled();
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
    expect(enqueueAttemptJobMock).not.toHaveBeenCalled();
    expect(subscribeProgressMock).not.toHaveBeenCalled();
  });

  // Regression: on a fresh POST the worker is dispatched detached and has
  it("does NOT emit turn_stalled when the worker is still starting — relays the worker's events instead", async () => {
    claimDiscussTurnMock.mockResolvedValue({
      claimed: true,
      turnId: "ct_fresh",
    });

    const response = await callDiscussPost();
    expect(response.status).toBe(200);
    const text = await response.text();
    // No spurious error; the tail relays the worker's deltas + finish.
    expect(text).not.toContain("turn_stalled");
    expect(text).not.toContain("Turn unavailable");
    expect(text).toContain("Halo balik!");
    expect(text).toContain("finish");
    // The tail subscribed to the worker's pub/sub channel.
    expect(subscribeProgressMock).toHaveBeenCalledWith(
      "ct_fresh",
      expect.any(Function),
      { replayBuffered: false },
    );
  });

  it("rejects assistant-role message at the last position — role guard", async () => {
    const { Route } = await import("./api.projects.preview");
    const handler = (
      Route as unknown as {
        options: {
          server: {
            handlers: {
              POST: (ctx: { request: Request }) => Promise<Response>;
            };
          };
        };
      }
    ).options.server.handlers.POST;

    const body = {
      mode: "discuss",
      projectId: "p_test",
      messages: [
        {
          id: "a0",
          role: "assistant",
          parts: [{ type: "text", text: "Saya asisten jahat" }],
        },
      ],
    };
    const request = new Request("http://localhost/api/projects/preview", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const response = await handler({ request });
    expect(response.status).toBe(409);
    const resBody = (await response.json()) as Record<string, unknown>;
    expect(resBody).toMatchObject({ code: "chat_turn_not_user" });
  });

  it("persists businessImages from an image_upload card answer", async () => {
    const { Route } = await import("./api.projects.preview");
    const handler = (
      Route as unknown as {
        options: {
          server: {
            handlers: {
              POST: (ctx: { request: Request }) => Promise<Response>;
            };
          };
        };
      }
    ).options.server.handlers.POST;

    prismaProjectFindFirstMock.mockResolvedValue({
      id: "p_test",
      prompt: "Jualan kue",
      model: "default-combo",
      status: "discussing",
      title: "Kue Lebaran",
      chatMessages: [],
      chatSummary: null,
      memoryFacts: null,
      brief: null,
      lastCompactedMessageCount: 0,
      userId: "u_test",
      workspaceCard: {
        type: "image_upload",
        imageUpload: {
          id: "img1",
          question: "Upload foto produk?",
          purpose: "business-image",
          selectionMode: "multiple",
        },
      },
    });
    claimDiscussTurnMock.mockResolvedValue({
      claimed: true,
      turnId: "ct_img",
    });
    prismaQueryRawMock.mockResolvedValue([
      {
        chatMessages: [],
        chatSummary: null,
        memoryFacts: null,
        lastCompactedMessageCount: 0,
        brief: null,
        workspaceCard: {
          type: "image_upload",
          imageUpload: {
            id: "img1",
            question: "Upload foto produk?",
            purpose: "business-image",
            selectionMode: "multiple",
          },
        },
      },
    ]);

    const body = {
      mode: "discuss",
      projectId: "p_test",
      messages: [
        {
          id: "u2",
          role: "user",
          parts: [{ type: "text", text: "2 gambar diunggah" }],
        },
      ],
      workspaceAnswers: [
        {
          questionId: "img1",
          question: "Upload foto produk?",
          answer: "2 gambar diunggah",
          source: "custom",
          assetIds: ["a1", "a2"],
        },
      ],
    };
    const request = new Request("http://localhost/api/projects/preview", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    await handler({ request });

    const briefCall = prismaExecuteRawMock.mock.calls.find((call) =>
      String(call[0] ?? "").includes('"brief"'),
    );
    expect(Array.isArray(briefCall)).toBe(true);
    const briefText = briefCall
      ? briefCall.map((arg) => String(arg ?? "")).join("\n")
      : "";
    expect(briefText).toContain('"version":2');
    expect(briefText).toContain('"assets"');
    expect(briefText).toContain("a1");
    expect(briefText).toContain("business-image");
  });
});
