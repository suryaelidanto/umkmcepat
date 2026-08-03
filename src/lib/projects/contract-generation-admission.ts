// src/lib/projects/contract-generation-admission.ts
// Execution admission gate for contract-v1. Independent of the assignment
// rollout setting: admission controls whether a contract-v1 attempt may be
// enqueued or mutated. Defaults to paused so no contract execution runs until
// an operator enables it. This is the emergency rollback knob (G3): flipping
// it to paused stops new contract attempts immediately without changing sticky
// engines or selected deployments.
import type { GenerationEngine } from "./generation-engine";

export type ContractAdmission = "paused" | "enabled";

export function isContractAdmissionValue(
  value: string,
): value is ContractAdmission {
  return value === "paused" || value === "enabled";
}

/** Throw when a contract-v1 project is not admitted for execution. Legacy-v1
 * is never gated here. */
export function assertContractGenerationAdmitted(input: {
  generationEngine: GenerationEngine | string;
  admission: ContractAdmission | string;
}): void {
  if (input.generationEngine !== "contract-v1") {
    return;
  }
  if (input.admission !== "enabled") {
    throw new Error("contract generation is paused");
  }
}
