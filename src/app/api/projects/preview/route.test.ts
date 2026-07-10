import { type UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  executeRawMock,
  generateTextMock,
  projectFindFirstMock,
  queryRawMock,
  streamTextMock,
} = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<unknown>>(async () => null),
  projectFindFirstMock: vi.fn(async () => ({
    id: "project_1",
    prompt: "Saya jual bakso",
    status: "discussing",
    title: "Website Bakso",
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
  generateTextMock: vi.fn(async ({ tools }) => {
    await tools.setWorkspaceUi.execute({
      briefPatch: { confidence: 20 },
      workspaceCard: {
        type: "question",
        question: {
          id: "kontak",
          question: "Nomor WhatsApp atau kontak yang mau dicantumin?",
          answerMode: "text",
          placeholder: "Contoh: 0812-3456-7890",
        },
      },
    });

    return {
      finishReason: "tool-calls",
      toolCalls: [{ toolName: "setWorkspaceUi" }],
      toolResults: [{ toolName: "setWorkspaceUi" }],
    };
  }),
  streamTextMock: vi.fn(({ tools }) => {
    void tools.setWorkspaceUi.execute({
      briefPatch: { offer: "Bakso" },
      workspaceCard: {
        type: "question",
        question: {
          id: "targetCustomer",
          question: "Pelanggan utama bakso ini siapa?",
          answerMode: "choice",
          options: [
            { label: "Pekerja sekitar", description: "Fokus makan siang." },
            { label: "Keluarga", description: "Fokus makan bersama." },
            { label: "Anak sekolah", description: "Fokus harga hemat." },
          ],
        },
      },
    });

    return {
      toUIMessageStreamResponse: ({
        onFinish,
      }: {
        onFinish: (input: { messages: unknown[] }) => void;
      }) => {
        void onFinish({ messages: [{ id: "m1", role: "user", parts: [] }] });
        return new Response("stream");
      },
    };
  }),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/ai", () => ({
  getAiModel: vi.fn(() => "test-model"),
  getAiTelemetry: vi.fn(() => ({ isEnabled: false })),
}));
vi.mock("@/lib/ai-request-log", () => ({
  writeAiRequestLog: vi.fn(async () => undefined),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: queryRawMock,
    $executeRaw: executeRawMock,
    project: { findFirst: projectFindFirstMock },
  },
}));
vi.mock("ai", () => ({
  convertToModelMessages: vi.fn(async (messages) => messages),
  generateText: generateTextMock,
  jsonSchema: vi.fn((schema) => schema),
  stepCountIs: vi.fn((count) => ({ count })),
  streamText: streamTextMock,
  tool: vi.fn((definition) => definition),
  validateUIMessages: vi.fn(async ({ messages }) => messages),
}));

import { POST } from "./route";
import { stripTransportDiagnosticMessages } from "./strip-transport-diagnostic-messages";

function authed() {
  authMock.mockResolvedValueOnce({
    user: { id: "user_1" },
    expires: new Date().toISOString(),
  });
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/projects/preview", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

describe("project preview AI route", () => {
  beforeEach(() => {
    authMock.mockResolvedValue(null);
    executeRawMock.mockClear();
    projectFindFirstMock.mockClear();
    queryRawMock.mockClear();
    generateTextMock.mockClear();
    streamTextMock.mockClear();
  });

  it("requires login before streaming AI", async () => {
    const response = await post({
      projectId: "project_1",
      message: { id: "m1", role: "user", parts: [] },
    });

    expect(response.status).toBe(401);
  });

  it("patches structured workspace answers before streaming the next discuss turn", async () => {
    authed();
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
              ],
            },
          ],
        },
      },
    ]);

    const response = await post({
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
    });

    expect(response.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(
          '"businessType":"aku ada toko bakso sih"',
        ),
      }),
    );
  });

  it("self-heals recent formatted answers from stored chat before streaming", async () => {
    authed();
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
              ],
            },
          ],
        },
      },
    ]);

    const response = await post({
      mode: "discuss",
      projectId: "project_1",
      message: {
        id: "m2",
        role: "user",
        parts: [{ type: "text", text: "oke jadi gimana" }],
      },
    });

    expect(response.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(
          '"businessType":"aku ada toko bakso sih"',
        ),
      }),
    );
  });

  it("streams through one AI SDK call and saves memory", async () => {
    authed();

    const response = await post({
      mode: "build",
      projectId: "project_1",
      message: {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "Bakso" }],
      },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("stream");
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(projectFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "project_1", userId: "user_1" } }),
    );
    expect(executeRawMock).toHaveBeenCalled();
  });

  it("persists discuss workspace card from tool output", async () => {
    authed();

    const response = await post({
      mode: "discuss",
      projectId: "project_1",
      message: {
        id: "answer_package_count",
        role: "user",
        parts: [{ type: "text", text: "Jawaban: 3-5 paket" }],
      },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("stream");
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(executeRawMock.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("persists the answer before the AI stream", async () => {
    authed();
    const callOrder: string[] = [];
    executeRawMock.mockImplementation(async () => {
      callOrder.push("executeRaw");
      return 1;
    });
    streamTextMock.mockImplementationOnce(() => {
      callOrder.push("streamText");
      return {
        toUIMessageStreamResponse: () => new Response("stream"),
      };
    });

    const response = await post({
      mode: "discuss",
      projectId: "project_1",
      message: {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "Bakso" }],
      },
    });

    expect(response.status).toBe(200);
    expect(callOrder[0]).toBe("executeRaw");
    expect(callOrder).toContain("streamText");
    expect(callOrder.indexOf("executeRaw")).toBeLessThan(
      callOrder.indexOf("streamText"),
    );
  });

  it("repairs a missing provider tool call after visible text finishes", async () => {
    authed();
    let finishCompleted: Promise<void> = Promise.resolve();

    streamTextMock.mockImplementationOnce(() => ({
      toUIMessageStreamResponse: ({
        onFinish,
      }: {
        onFinish: (input: {
          messages: unknown[];
          responseMessage: unknown;
        }) => void | Promise<void>;
      }) => {
        const responseMessage = {
          id: "assistant_1",
          role: "assistant",
          parts: [{ type: "text", text: "Nomor WA aktifnya apa?" }],
        };
        finishCompleted = Promise.resolve(
          onFinish({
            messages: [
              {
                id: "assistant_old",
                role: "assistant",
                parts: [
                  {
                    type: "tool-setWorkspaceUi",
                    state: "output-available",
                    toolCallId: "old-tool",
                    input: {},
                    output: {},
                  },
                ],
              },
              { id: "m1", role: "user", parts: [] },
              responseMessage,
            ],
            responseMessage,
          }),
        );
        return new Response("stream");
      },
    }));

    const response = await post({
      mode: "discuss",
      projectId: "project_1",
      message: {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "Bikin rental PS Neon Pad" }],
      },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("stream");
    await finishCompleted;

    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ toolChoice: "required" }),
    );
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "assistant" }),
        ]),
        toolChoice: { type: "tool", toolName: "setWorkspaceUi" },
      }),
    );
    expect(executeRawMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(executeRawMock.mock.calls)).toContain(
      "tool-setWorkspaceUi",
    );
  });

  it("repairs when the primary workspace tool execution rejects", async () => {
    authed();
    let finishCompleted: Promise<void> = Promise.resolve();

    streamTextMock.mockImplementationOnce(({ tools }) => {
      executeRawMock.mockRejectedValueOnce(new Error("database unavailable"));
      void tools.setWorkspaceUi
        .execute({
          workspaceCard: {
            type: "question",
            question: {
              id: "kontak",
              question: "Nomor WhatsApp?",
              answerMode: "text",
            },
          },
        })
        .catch(() => undefined);

      return {
        toUIMessageStreamResponse: ({
          onFinish,
        }: {
          onFinish: (input: { messages: unknown[] }) => void | Promise<void>;
        }) => {
          finishCompleted = Promise.resolve(
            onFinish({
              messages: [
                { id: "m1", role: "user", parts: [] },
                {
                  id: "assistant_1",
                  role: "assistant",
                  parts: [{ type: "text", text: "Nomor WA aktifnya apa?" }],
                },
              ],
            }),
          );
          return new Response("stream");
        },
      };
    });

    const response = await post({
      mode: "discuss",
      projectId: "project_1",
      message: {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "Bikin rental PS Neon Pad" }],
      },
    });

    expect(response.status).toBe(200);
    await finishCompleted;
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it("strips transport diagnostic messages before persistence", () => {
    const messages = [
      {
        id: "assistant_error",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: '[provider transport error: {"type":"server_error","message":"Network connection lost."}]',
          },
          {
            type: "text",
            text: "Lanjut ke pertanyaan berikutnya.",
          },
        ],
      },
      {
        id: "assistant_tool",
        role: "assistant",
        parts: [
          {
            type: "tool-setWorkspaceUi",
            state: "output-available",
            toolName: "setWorkspaceUi",
            toolCallId: "tool-1",
            args: {},
            result: null,
          } as unknown,
        ],
      },
      {
        id: "assistant_only_command",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: ' [provider transport error: {"type":"server_error"}] ',
          },
        ],
      },
      {
        id: "user_input",
        role: "user",
        parts: [
          {
            type: "text",
            text: "Aku mau lanjut",
          },
        ],
      },
    ] as UIMessage[];

    const cleaned = stripTransportDiagnosticMessages(messages);

    expect(cleaned).toHaveLength(3);
    expect(cleaned[0]).toEqual({
      ...messages[0],
      parts: [
        {
          type: "text",
          text: "Lanjut ke pertanyaan berikutnya.",
        },
      ],
    });
    expect(cleaned[1]).toEqual(messages[1]);
    expect(cleaned[2]).toEqual(messages[3]);
  });
});
