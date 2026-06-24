import { describe, expect, it, vi } from "vitest";

const { authMock, projectFindFirstMock, queryRawMock, executeRawMock } =
  vi.hoisted(() => ({
    authMock: vi.fn<() => Promise<unknown>>(async () => null),
    projectFindFirstMock: vi.fn(async () => ({
      id: "project_1",
      prompt: "Saya jual bakso",
      status: "discussing",
    })),
    queryRawMock: vi.fn(async () => [
      {
        brief: null,
        chatMessages: [],
        chatSummary: null,
        lastCompactedMessageCount: 0,
        memoryFacts: null,
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
  generateDiscussionTurn: vi.fn(async () => ({
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
