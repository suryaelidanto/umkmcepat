import { recordAiCall } from "@/lib/ai/ai-call-record";
import { chargeEnergyForStep } from "@/lib/payment/user-credits";

export type StepChargeEvent = {
  energyUsed: number;
  remaining: number;
  reason: string;
};

type StepLike = {
  usage?: { inputTokens?: number | null; outputTokens?: number | null } | null;
  response?: { modelId?: string };
  reason?: string;
};

export type StepCharger = {
  readonly userId: string;
  readonly modelId: string;
  readonly onCharge?: (event: StepChargeEvent) => void;
  onStepFinish: (step: StepLike) => Promise<void>;
  isExhausted: () => boolean;
  totals: () => {
    inputTokens: number;
    outputTokens: number;
    energyUsed: number;
  };
};

const REASON_TO_RECORD_TASK: Record<string, string> = {
  "build:step": "build-step",
  "edit:step": "edit",
};

export function createStepCharger(opts: {
  userId: string;
  reason: string;
  modelId: string;
  projectId?: string | null;
  onCharge?: (event: StepChargeEvent) => void;
  recordMeta?: {
    attemptId?: string;
    buildId?: string;
    phase?: string;
    task?: string;
    turnId?: string;
  };
}): StepCharger {
  let inputTokens = 0;
  let outputTokens = 0;
  let energyUsed = 0;
  let exhausted = false;
  let stepIndex = 0;
  let stepStartedAt = performance.now();

  return {
    userId: opts.userId,
    modelId: opts.modelId,
    onCharge: opts.onCharge,
    isExhausted: () => exhausted,
    totals: () => ({ inputTokens, outputTokens, energyUsed }),
    async onStepFinish(step) {
      // The ai-sdk has no per-step start hook, so step latency is measured
      const requestMs = Math.round(performance.now() - stepStartedAt);
      stepStartedAt = performance.now();
      const servedModel = step?.response?.modelId || null;
      recordAiCall({
        modelRequested: opts.modelId,
        modelServed: servedModel,
        projectId: opts.projectId ?? undefined,
        status: "ok",
        inputTokens: step?.usage?.inputTokens ?? undefined,
        outputTokens: step?.usage?.outputTokens ?? undefined,
        requestMs,
        stepIndex,
        task: REASON_TO_RECORD_TASK[opts.reason] ?? "unknown",
        ...(stepIndex === 0 ? { ttftMs: requestMs } : {}),
        ...opts.recordMeta,
      });
      stepIndex += 1;

      const input = Math.max(0, Math.floor(step?.usage?.inputTokens ?? 0));
      const output = Math.max(0, Math.floor(step?.usage?.outputTokens ?? 0));
      if (input <= 0 && output <= 0) {
        return;
      }

      inputTokens += input;
      outputTokens += output;

      const effectiveReason = step?.reason || opts.reason;
      const effectiveModelId = servedModel || opts.modelId;
      const charged = await chargeEnergyForStep({
        userId: opts.userId,
        modelId: effectiveModelId,
        inputTokens: input,
        outputTokens: output,
        reason: effectiveReason,
        projectId: opts.projectId ?? null,
      });

      if (!charged) {
        return;
      }

      energyUsed += charged.energyUsed;
      if (charged.remaining <= 0) {
        exhausted = true;
      }
      opts.onCharge?.({
        energyUsed: charged.energyUsed,
        remaining: charged.remaining,
        reason: opts.reason,
      });
    },
  };
}
