import { beforeEach, describe, expect, it, vi } from "vitest";

const { chargeEnergyForStepMock, recordAiCallMock } = vi.hoisted(() => ({
  chargeEnergyForStepMock: vi.fn(),
  recordAiCallMock: vi.fn(),
}));

vi.mock("@/lib/payment/user-credits", () => ({
  chargeEnergyForStep: chargeEnergyForStepMock,
}));

vi.mock("@/lib/ai/ai-call-record", () => ({
  classifyAiError: (error: unknown) =>
    error instanceof Error && /timeout/i.test(error.message)
      ? "timeout"
      : "unknown",
  recordAiCall: recordAiCallMock,
}));

import { createStepCharger } from "./energy-step-charger";

const step = (inputTokens: number, outputTokens: number) => ({
  usage: { inputTokens, outputTokens },
  response: { modelId: "resolved-model" },
});

describe("createStepCharger", () => {
  beforeEach(() => {
    chargeEnergyForStepMock.mockReset();
    recordAiCallMock.mockReset();
  });

  it("charges each step and accumulates totals", async () => {
    chargeEnergyForStepMock.mockResolvedValue({
      energyUsed: 100,
      remaining: 5_000,
    });
    const charger = createStepCharger({
      userId: "u1",
      reason: "build:step",
      modelId: "fallback-model",
      projectId: "p1",
    });

    await charger.onStepFinish(step(10, 20));
    await charger.onStepFinish(step(30, 40));

    expect(chargeEnergyForStepMock).toHaveBeenCalledTimes(2);
    expect(charger.totals()).toEqual({
      inputTokens: 40,
      outputTokens: 60,
      energyUsed: 200,
    });
    expect(charger.isExhausted()).toBe(false);
  });

  it("prefers the model id reported by the response over the fallback", async () => {
    chargeEnergyForStepMock.mockResolvedValue({ energyUsed: 1, remaining: 1 });
    const charger = createStepCharger({
      userId: "u1",
      reason: "build:step",
      modelId: "fallback-model",
    });

    await charger.onStepFinish(step(10, 10));

    expect(chargeEnergyForStepMock.mock.calls[0][0].modelId).toBe(
      "resolved-model",
    );
  });

  it("becomes exhausted when remaining hits zero", async () => {
    chargeEnergyForStepMock.mockResolvedValue({
      energyUsed: 100,
      remaining: 0,
    });
    const charger = createStepCharger({
      userId: "u1",
      reason: "build:step",
      modelId: "m",
    });

    expect(charger.isExhausted()).toBe(false);
    await charger.onStepFinish(step(10, 10));
    expect(charger.isExhausted()).toBe(true);
  });

  it("stays exhausted once tripped, even if a later charge reports credit", async () => {
    const charger = createStepCharger({
      userId: "u1",
      reason: "build:step",
      modelId: "m",
    });

    chargeEnergyForStepMock.mockResolvedValue({ energyUsed: 1, remaining: 0 });
    await charger.onStepFinish(step(1, 1));
    chargeEnergyForStepMock.mockResolvedValue({
      energyUsed: 1,
      remaining: 999,
    });
    await charger.onStepFinish(step(1, 1));

    expect(charger.isExhausted()).toBe(true);
  });

  it("ignores steps with no usage", async () => {
    const charger = createStepCharger({
      userId: "u1",
      reason: "build:step",
      modelId: "m",
    });

    await charger.onStepFinish({ usage: null });

    expect(chargeEnergyForStepMock).not.toHaveBeenCalled();
    expect(charger.totals().energyUsed).toBe(0);
  });

  it("emits an onCharge event per charged step", async () => {
    chargeEnergyForStepMock.mockResolvedValue({
      energyUsed: 42,
      remaining: 7,
    });
    const onCharge = vi.fn();
    const charger = createStepCharger({
      userId: "u1",
      reason: "build:step",
      modelId: "m",
      onCharge,
    });

    await charger.onStepFinish(step(5, 5));

    expect(onCharge).toHaveBeenCalledWith({
      energyUsed: 42,
      remaining: 7,
      reason: "build:step",
    });
  });

  it("does not throw when the charge fails", async () => {
    chargeEnergyForStepMock.mockResolvedValue(null);
    const charger = createStepCharger({
      userId: "u1",
      reason: "build:step",
      modelId: "m",
    });

    await expect(charger.onStepFinish(step(5, 5))).resolves.toBeUndefined();
    expect(charger.isExhausted()).toBe(false);
  });

  it("records a failed provider step when generation times out", () => {
    vi.useFakeTimers();
    try {
      const charger = createStepCharger({
        userId: "u1",
        reason: "build:step",
        modelId: "requested-model",
        projectId: "p1",
        recordMeta: { attemptId: "a1" },
      });

      vi.advanceTimersByTime(180_000);
      charger.onStepError(new Error("Step timeout of 180000ms exceeded"));

      expect(recordAiCallMock).toHaveBeenCalledWith(
        expect.objectContaining({
          attemptId: "a1",
          errorClass: "timeout",
          modelRequested: "requested-model",
          requestMs: 180_000,
          status: "timeout",
          stepIndex: 0,
          task: "build-step",
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("exposes userId, modelId, and onCharge for child chargers", () => {
    const onCharge = vi.fn();
    const charger = createStepCharger({
      userId: "u1",
      reason: "build:step",
      modelId: "fallback-model",
      onCharge,
    });
    expect(charger.userId).toBe("u1");
    expect(charger.modelId).toBe("fallback-model");
    expect(charger.onCharge).toBe(onCharge);
  });

  it("records ttftMs === requestMs on step 0 of a buffered agent call", async () => {
    vi.useFakeTimers();
    try {
      const charger = createStepCharger({
        userId: "u1",
        reason: "build:step",
        modelId: "m",
      });

      vi.advanceTimersByTime(300);
      await charger.onStepFinish(step(10, 10));

      expect(recordAiCallMock).toHaveBeenCalledWith(
        expect.objectContaining({ requestMs: 300, stepIndex: 0, ttftMs: 300 }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("records no ttftMs on steps after step 0", async () => {
    vi.useFakeTimers();
    try {
      const charger = createStepCharger({
        userId: "u1",
        reason: "build:step",
        modelId: "m",
      });

      vi.advanceTimersByTime(100);
      await charger.onStepFinish(step(5, 5));
      vi.advanceTimersByTime(250);
      await charger.onStepFinish(step(5, 5));

      const second = recordAiCallMock.mock.calls[1][0];
      expect(second.stepIndex).toBe(1);
      expect(second.requestMs).toBe(250);
      expect(second.ttftMs).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
