import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaAiCallRecordCreateMock, devLogMock } = vi.hoisted(() => ({
  prismaAiCallRecordCreateMock: vi.fn(async () => ({})),
  devLogMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiCallRecord: {
      create: prismaAiCallRecordCreateMock,
    },
  },
}));

vi.mock("@/lib/dev-log", () => ({
  devLog: devLogMock,
}));

import { recordAiCall, startAiCallTimer } from "./ai-call-record";

describe("recordAiCall", () => {
  beforeEach(() => {
    prismaAiCallRecordCreateMock.mockReset();
    prismaAiCallRecordCreateMock.mockResolvedValue({});
    devLogMock.mockReset();
  });

  it("writes a full entry unchanged", () => {
    recordAiCall({
      attemptId: "att-1",
      buildId: "bld-1",
      cachedTokens: 10,
      errorClass: "rate-limit",
      hedged: true,
      inputTokens: 100,
      modelRequested: "discuss-combo-2",
      modelServed: "openai/gpt-5-mini",
      outputTokens: 50,
      phase: "hedge",
      projectId: "prj-1",
      raceRole: "winner",
      requestMs: 1234,
      retryCount: 1,
      status: "ok",
      stepIndex: 3,
      task: "discuss",
      ttftMs: 300,
      turnId: "trn-1",
    });

    expect(prismaAiCallRecordCreateMock).toHaveBeenCalledWith({
      data: {
        attemptId: "att-1",
        buildId: "bld-1",
        cachedTokens: 10,
        errorClass: "rate-limit",
        hedged: true,
        inputTokens: 100,
        modelRequested: "discuss-combo-2",
        modelServed: "openai/gpt-5-mini",
        outputTokens: 50,
        phase: "hedge",
        projectId: "prj-1",
        raceRole: "winner",
        requestMs: 1234,
        retryCount: 1,
        status: "ok",
        stepIndex: 3,
        task: "discuss",
        ttftMs: 300,
        turnId: "trn-1",
      },
    });
  });

  it("writes a required-only entry with defaults", () => {
    recordAiCall({
      modelRequested: "moderation-combo",
      status: "ok",
      task: "moderation",
    });

    expect(prismaAiCallRecordCreateMock).toHaveBeenCalledWith({
      data: {
        modelRequested: "moderation-combo",
        status: "ok",
        task: "moderation",
      },
    });
  });

  it("swallows a DB failure and logs it, never throwing", async () => {
    prismaAiCallRecordCreateMock.mockRejectedValue(new Error("boom"));

    expect(() =>
      recordAiCall({
        modelRequested: "m",
        status: "ok",
        task: "moderation",
      }),
    ).not.toThrow();

    await vi.waitFor(() => {
      expect(devLogMock).toHaveBeenCalledWith(
        "ai-call-ledger",
        "write-failed",
        { error: "boom" },
      );
    });
  });

  it("clamps varchars to their db lengths", () => {
    recordAiCall({
      errorClass: "e".repeat(200),
      modelRequested: "m".repeat(200),
      modelServed: "s".repeat(200),
      phase: "p".repeat(200),
      raceRole: "r".repeat(200),
      status: "x".repeat(200),
      task: "t".repeat(200),
    });

    const data = prismaAiCallRecordCreateMock.mock.calls[0]?.[0]
      ?.data as Record<string, string>;
    expect(data.task).toHaveLength(32);
    expect(data.phase).toHaveLength(32);
    expect(data.status).toHaveLength(16);
    expect(data.modelRequested).toHaveLength(160);
    expect(data.modelServed).toHaveLength(160);
    expect(data.errorClass).toHaveLength(64);
    expect(data.raceRole).toHaveLength(16);
  });
});

describe("startAiCallTimer", () => {
  it("returns elapsed ms as a rounded int", async () => {
    const stop = startAiCallTimer();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const { requestMs } = stop();
    expect(Number.isInteger(requestMs)).toBe(true);
    expect(requestMs).toBeGreaterThan(0);
  });
});
