import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaAiCallRecordCreateMock, devLogMock } = vi.hoisted(() => ({
  prismaAiCallRecordCreateMock: vi.fn(
    async (_args: { data: Record<string, unknown> }) => ({}),
  ),
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

import {
  classifyAiError,
  recordAiCall,
  startAiCallTimer,
} from "./ai-call-record";

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
      inputTokens: 100,
      modelRequested: "discuss-combo-2",
      modelServed: "openai/gpt-5-mini",
      outputTokens: 50,
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
        inputTokens: 100,
        modelRequested: "discuss-combo-2",
        modelServed: "openai/gpt-5-mini",
        outputTokens: 50,
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

    const call = prismaAiCallRecordCreateMock.mock.calls[0];
    const data = call?.[0]?.data as Record<string, string>;
    expect(data.task).toHaveLength(32);
    expect(data.phase).toHaveLength(32);
    expect(data.status).toHaveLength(16);
    expect(data.modelRequested).toHaveLength(160);
    expect(data.modelServed).toHaveLength(160);
    expect(data.errorClass).toHaveLength(64);
    expect(data.raceRole).toHaveLength(16);
  });
});

describe("classifyAiError", () => {
  it("maps rate-limit patterns", () => {
    expect(classifyAiError(new Error("rate limit exceeded"))).toBe(
      "rate-limit",
    );
    expect(classifyAiError(new Error("HTTP 429 Too Many Requests"))).toBe(
      "rate-limit",
    );
  });

  it("maps timeout patterns", () => {
    expect(classifyAiError(new Error("request timed out"))).toBe("timeout");
    expect(classifyAiError(new Error("This operation was aborted"))).toBe(
      "timeout",
    );
  });

  it("maps schema patterns", () => {
    expect(classifyAiError(new Error("schema validation failed"))).toBe(
      "schema",
    );
    expect(classifyAiError(new Error("HTTP 422 Unprocessable Entity"))).toBe(
      "schema",
    );
    expect(classifyAiError(new Error("invalid request body"))).toBe("schema");
  });

  it("maps parse patterns", () => {
    expect(
      classifyAiError(new Error("Unexpected token in JSON at position 0")),
    ).toBe("parse");
    expect(
      classifyAiError(new SyntaxError("Unexpected end of JSON input")),
    ).toBe("parse");
  });

  it("maps transport patterns", () => {
    expect(classifyAiError(new Error("socket hang up"))).toBe("transport");
    expect(classifyAiError(new Error("ECONNRESET"))).toBe("transport");
  });

  it("falls back to unknown", () => {
    expect(classifyAiError(new Error("weird provider state"))).toBe("unknown");
    expect(classifyAiError("string error")).toBe("unknown");
    expect(classifyAiError(undefined)).toBe("unknown");
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

  it("withTtft measures ttftMs from the first marked content chunk", async () => {
    vi.useFakeTimers();
    try {
      const stop = startAiCallTimer({ withTtft: true });
      // Stream emits content chunk at t=120ms, completes at t=500ms.
      vi.advanceTimersByTime(120);
      stop.firstChunk();
      vi.advanceTimersByTime(380);
      expect(stop()).toEqual({ requestMs: 500, ttftMs: 120 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("withTtft latches on the first mark — later chunks do not move ttftMs", () => {
    vi.useFakeTimers();
    try {
      const stop = startAiCallTimer({ withTtft: true });
      vi.advanceTimersByTime(120);
      stop.firstChunk();
      vi.advanceTimersByTime(180);
      stop.firstChunk();
      vi.advanceTimersByTime(200);
      expect(stop()).toEqual({ requestMs: 500, ttftMs: 120 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("withTtft leaves ttftMs null when the stream fails before any chunk", () => {
    vi.useFakeTimers();
    try {
      const stop = startAiCallTimer({ withTtft: true });
      vi.advanceTimersByTime(250);
      expect(stop()).toEqual({ requestMs: 250, ttftMs: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it("withTtft mirrors requestMs for non-streaming calls that never mark a chunk", () => {
    vi.useFakeTimers();
    try {
      const stop = startAiCallTimer({ withTtft: true });
      vi.advanceTimersByTime(400);
      expect(stop({ nonStreaming: true })).toEqual({
        requestMs: 400,
        ttftMs: 400,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
