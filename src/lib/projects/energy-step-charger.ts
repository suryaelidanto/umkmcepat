import { chargeEnergyForStep } from "@/lib/user-credits";

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

/**
 * Charges energy once per agent step via the ai-sdk `onStepFinish` hook.
 * `isExhausted` is latching: once the balance hits zero the loop must stop,
 * and a concurrently-granted top-up should not silently resume it.
 */
export function createStepCharger(opts: {
  userId: string;
  reason: string;
  modelId: string;
  projectId?: string | null;
  onCharge?: (event: StepChargeEvent) => void;
}): StepCharger {
  let inputTokens = 0;
  let outputTokens = 0;
  let energyUsed = 0;
  let exhausted = false;

  return {
    userId: opts.userId,
    modelId: opts.modelId,
    onCharge: opts.onCharge,
    isExhausted: () => exhausted,
    totals: () => ({ inputTokens, outputTokens, energyUsed }),
    async onStepFinish(step) {
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
