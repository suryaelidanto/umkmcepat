import { getEnv } from "@/lib/config";

export type AiAgentStepKey = "generate" | "repair";

type AiAgentStepConfig = {
  defaultSteps: number;
  env: string;
  maxSteps: number;
  minSteps: number;
};

const AI_AGENT_STEPS = {
  generate: {
    env: "AI_AGENT_GENERATE_MAX_STEPS",
    defaultSteps: 30,
    minSteps: 15,
    maxSteps: 60,
  },
  repair: {
    env: "AI_AGENT_REPAIR_MAX_STEPS",
    defaultSteps: 12,
    minSteps: 4,
    maxSteps: 40,
  },
} satisfies Record<AiAgentStepKey, AiAgentStepConfig>;

/** Max tool-loop steps for generate/repair agents (env-clamped). */
export function getAgentMaxSteps(key: AiAgentStepKey): number {
  const config = AI_AGENT_STEPS[key];
  const raw = getEnv(config.env);

  if (!raw) {
    return config.defaultSteps;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return config.defaultSteps;
  }

  return Math.min(
    config.maxSteps,
    Math.max(config.minSteps, Math.round(parsed)),
  );
}
