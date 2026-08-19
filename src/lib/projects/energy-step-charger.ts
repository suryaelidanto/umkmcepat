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

/** Ledger task per charge reason. */
const REASON_TO_RECORD_TASK: Record<string, string> = {
  "build:step": "build-step",
  "edit:step": "edit",
  "build:subagent": "build-step",
};

/**
 * Charges energy once per agent step via the ai-sdk `onStepFinish` hook and
 * records one AiCallRecord row per step (fire-and-forget).
 * `isExhausted` is latching: once the balance hits zero the loop must stop,
 * and a concurrently-granted top-up should not silently resume it.
 */
export function createStepCharger(opts: {
  userId: string;
  reason: string;
  modelId: string;
  projectId?: string | null;
  onCharge?: (event: StepChargeEvent) => void;
  /** Extra AiCallRecord fields merged into every per-step row. */
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
      // from the previous step's finish (charger creation for step 0).
      // Steps are buffered (ToolLoopAgent never streams): there is no
      // first-token moment, so step 0 reports ttftMs = requestMs for the
      // logical call; later steps carry no ttftMs.
      const requestMs = Math.round(performance.now() - stepStartedAt);
      stepStartedAt = performance.now();
      recordAiCall({
        modelRequested: opts.modelId,
        modelServed: step?.response?.modelId,
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

      const charged = await chargeEnergyForStep({
        userId: opts.userId,
        modelId: step?.response?.modelId || opts.modelId,
        inputTokens: input,
        outputTokens: output,
        reason: opts.reason,
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
