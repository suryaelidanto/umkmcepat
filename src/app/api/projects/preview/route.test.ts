import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  executeRawMock,
  generateDiscussionTurnMock,
  projectFindFirstMock,
  queryRawMock,
} = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<unknown>>(async () => null),
  generateDiscussionTurnMock: vi.fn(async () => ({
    assistantMessage: "Saya bantu rapikan brief dulu.",
    briefPatch: { offer: "Bakso" },
    intent: "ask_question",
    workspaceCard: {
      type: "questions",
      questions: [
        {
          id: "targetCustomer",
          question: "Pelanggan utama bakso ini siapa?",
          recommendedOptionLabel: "Pekerja sekitar",
          options: [
            { label: "Pekerja sekitar", description: "Fokus makan siang." },
            { label: "Keluarga", description: "Fokus makan bersama." },
            { label: "Anak sekolah", description: "Fokus harga hemat." },
          ],
        },
      ],
    },
  })),
  projectFindFirstMock: vi.fn(async () => ({
    id: "project_1",
    prompt: "Saya jual bakso",
    status: "discussing",
  })),
  queryRawMock: vi.fn(async () => [
    {
      brief: null,
      chatMessages: [] as unknown,
      chatSummary: null,
      lastCompactedMessageCount: 0,
      memoryFacts: null,
      workspaceCard: null as unknown,
    },
  ]),
  executeRawMock: vi.fn(async () => 1),
}));

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/ai", () => ({
  getAiModel: vi.fn(() => "test-model"),
}));

vi.mock("@/lib/projects/chat-memory", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../lib/projects/chat-memory")
  >("../../../../lib/projects/chat-memory");

  return actual;
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: queryRawMock,
    $executeRaw: executeRawMock,
    project: {
      findFirst: projectFindFirstMock,
    },
  },
}));
vi.mock("@/lib/projects/discussion-turn", () => ({
  createFallbackDiscussionTurn: vi.fn(() => ({
    assistantMessage: "Saya bantu rapikan brief dulu.",
    briefPatch: {},
    intent: "answer_only",
    workspaceCard: { type: "none" },
  })),
  generateDiscussionTurn: generateDiscussionTurnMock,
}));

vi.mock("ai", () => ({
  createUIMessageStream: vi.fn(({ execute, onFinish }) => {
    void execute({
      writer: {
        merge: vi.fn(),
        onError: undefined,
        write: vi.fn(),
      },
    });
    void onFinish?.({
      messages: [{ id: "m1", role: "user", parts: [] }],
      responseMessage: { id: "a1", role: "assistant", parts: [] },
    });
    return new ReadableStream();
  }),
  createUIMessageStreamResponse: vi.fn(() => new Response("stream")),
  validateUIMessages: vi.fn(async ({ messages }) => messages),
}));

import { POST } from "./route";

describe("project preview AI route", () => {
  beforeEach(() => {
    authMock.mockResolvedValue(null);
    executeRawMock.mockClear();
    generateDiscussionTurnMock.mockClear();
    projectFindFirstMock.mockClear();
    queryRawMock.mockClear();
  });

  it("requires login before streaming AI", async () => {
    authMock.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("http://localhost/api/projects/preview", {
        method: "POST",
        body: JSON.stringify({
          projectId: "project_1",
          message: { id: "m1", role: "user", parts: [] },
        }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("patches structured workspace answers before generating the next turn", async () => {
    authMock.mockResolvedValueOnce({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    });
    queryRawMock.mockResolvedValueOnce([
      {
        brief: null,
        chatMessages: [],
        chatSummary: null,
        lastCompactedMessageCount: 0,
        memoryFacts: null,
        workspaceCard: {
          type: "questions",
          questions: [
            {
              id: "businessType",
              question: "Apa jenis usaha Anda?",
              options: [
                { label: "Warung Bakso", description: "Fokus bakso." },
                { label: "Kedai Kopi", description: "Fokus kopi." },
                { label: "Laundry", description: "Fokus laundry." },
              ],
            },
          ],
        },
      },
    ]);

    const response = await POST(
      new Request("http://localhost/api/projects/preview", {
        method: "POST",
        body: JSON.stringify({
          mode: "discuss",
          projectId: "project_1",
          workspaceAnswers: [
            {
              answer: "aku ada toko bakso sih",
              question: "Apa jenis usaha Anda?",
              questionId: "businessType",
              source: "custom",
            },
          ],
          message: {
            id: "m1",
            role: "user",
            parts: [
              {
                type: "text",
                text: "1. Apa jenis usaha Anda?\nJawaban: aku ada toko bakso sih",
              },
            ],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(generateDiscussionTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: expect.objectContaining({
          businessType: "aku ada toko bakso sih",
        }),
      }),
    );
  });

  it("self-heals recent formatted answers from stored chat", async () => {
    authMock.mockResolvedValueOnce({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    });
    queryRawMock.mockResolvedValueOnce([
      {
        brief: null,
        chatMessages: [
          {
            id: "old_user_answer",
            role: "user",
            parts: [
              {
                type: "text",
                text: "1. Apa jenis bisnis kamu saat ini?\nJawaban: aku ada toko bakso sih",
              },
            ],
          },
        ],
        chatSummary: null,
        lastCompactedMessageCount: 0,
        memoryFacts: null,
        workspaceCard: {
          type: "questions",
          questions: [
            {
              id: "businessType",
              question: "Apa jenis usaha Anda?",
              options: [
                { label: "Warung Bakso", description: "Fokus bakso." },
                { label: "Kedai Kopi", description: "Fokus kopi." },
                { label: "Laundry", description: "Fokus laundry." },
              ],
            },
          ],
        },
      },
    ]);

    const response = await POST(
      new Request("http://localhost/api/projects/preview", {
        method: "POST",
        body: JSON.stringify({
          mode: "discuss",
          projectId: "project_1",
          message: {
            id: "m2",
            role: "user",
            parts: [{ type: "text", text: "oke jadi gimana" }],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(generateDiscussionTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: expect.objectContaining({
          businessType: "aku ada toko bakso sih",
        }),
      }),
    );
  });

  it("streams through the AI SDK for authenticated users and saves memory", async () => {
    authMock.mockResolvedValueOnce({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    });

    const response = await POST(
      new Request("http://localhost/api/projects/preview", {
        method: "POST",
        body: JSON.stringify({
          mode: "build",
          projectId: "project_1",
          message: {
            id: "m1",
            role: "user",
            parts: [{ type: "text", text: "Bakso" }],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("stream");
    expect(projectFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "project_1", userId: "user_1" },
      }),
    );
    expect(executeRawMock).toHaveBeenCalled();
  });
});
