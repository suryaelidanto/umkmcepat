import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  charge: vi.fn(),
  devLog: vi.fn(),
  maybeCompact: vi.fn(),
  moderationModel: vi.fn(() => "mod-model"),
  persistCompaction: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mocks.queryRaw(...args),
  },
}));

vi.mock("@/lib/dev-log", () => ({
  devLog: (...args: unknown[]) => mocks.devLog(...args),
}));

vi.mock("@/lib/ai-models", () => ({
  getModerationModel: () => mocks.moderationModel(),
}));

vi.mock("@/lib/projects/chat-compaction", () => ({
  maybeCompactProjectChat: (...args: unknown[]) => mocks.maybeCompact(...args),
}));

vi.mock("@/lib/projects/discuss-turn-shared", () => ({
  persistProjectChatCompaction: (...args: unknown[]) =>
    mocks.persistCompaction(...args),
}));

vi.mock("@/lib/user-credits", () => ({
  chargeEnergyForAiUsage: (...args: unknown[]) => mocks.charge(...args),
}));

import { runQueuedProjectCompaction } from "./chat-compaction-queue-worker";

const storedMessage = {
  id: "m1",
  role: "user" as const,
  parts: [{ type: "text" as const, text: "hai" }],
};

describe("runQueuedProjectCompaction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads chat state, persists compaction, and charges at compaction model", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        chatMessages: [storedMessage],
        chatSummary: { version: 1, text: "old", compactedMessageCount: 0 },
        memoryFacts: { version: 1, facts: [], decisions: [], preferences: [] },
      },
    ]);
    mocks.maybeCompact.mockResolvedValue({
      compactedMessageCount: 3,
      memoryFacts: { version: 1, facts: ["A"], decisions: [], preferences: [] },
      summary: { version: 1, text: "new", compactedMessageCount: 3 },
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    await runQueuedProjectCompaction({
      kind: "compaction",
      projectId: "p1",
      turnId: "ct_1",
      userId: "u1",
    });

    expect(mocks.maybeCompact).toHaveBeenCalledWith(
      expect.objectContaining({
        correlation: { projectId: "p1", turnId: "ct_1" },
      }),
    );
    expect(mocks.persistCompaction).toHaveBeenCalledWith(
      expect.objectContaining({ compactedMessageCount: 3, projectId: "p1" }),
    );
    expect(mocks.charge).toHaveBeenCalledWith({
      userId: "u1",
      projectId: "p1",
      modelId: "mod-model",
      inputTokens: 10,
      outputTokens: 5,
      reason: "discuss:compaction",
    });
  });

  it("does not persist or charge when compaction is not needed", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        chatMessages: [storedMessage],
        chatSummary: null,
        memoryFacts: null,
      },
    ]);
    mocks.maybeCompact.mockResolvedValue(null);

    await runQueuedProjectCompaction({
      kind: "compaction",
      projectId: "p1",
      turnId: "ct_1",
      userId: "u1",
    });

    expect(mocks.persistCompaction).not.toHaveBeenCalled();
    expect(mocks.charge).not.toHaveBeenCalled();
  });

  it("logs compaction failures without throwing", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        chatMessages: [storedMessage],
        chatSummary: null,
        memoryFacts: null,
      },
    ]);
    mocks.maybeCompact.mockRejectedValue(new Error("boom"));

    await expect(
      runQueuedProjectCompaction({
        kind: "compaction",
        projectId: "p1",
        turnId: "ct_1",
        userId: "u1",
      }),
    ).resolves.toBeUndefined();

    expect(mocks.devLog).toHaveBeenCalledWith(
      "discuss",
      "compaction-failed",
      expect.objectContaining({ projectId: "p1", turnId: "ct_1" }),
    );
  });
});
