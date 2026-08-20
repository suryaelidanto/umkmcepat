import { getSettingSync } from "@/lib/config/app-settings";

export type AiAgentStepKey = "generate" | "repair" | "subagent";

type AiAgentStepConfig = {
  key: string;
  defaultSteps: number;
  env: string;
  maxSteps: number;
  minSteps: number;
};

const AI_AGENT_STEPS = {
  generate: {
    key: "ai.agent.generate_max_steps",
    env: "AI_AGENT_GENERATE_MAX_STEPS",
    defaultSteps: 30,
    minSteps: 15,
    maxSteps: 60,
  },
  repair: {
    key: "ai.agent.repair_max_steps",
    env: "AI_AGENT_REPAIR_MAX_STEPS",
    defaultSteps: 12,
    minSteps: 4,
    maxSteps: 40,
  },
  subagent: {
    key: "ai.agent.subagent_max_steps",
    env: "AI_AGENT_SUBAGENT_MAX_STEPS",
    defaultSteps: 8,
    minSteps: 2,
    maxSteps: 15,
  },
} satisfies Record<AiAgentStepKey, AiAgentStepConfig>;

export function getAgentMaxSteps(key: AiAgentStepKey): number {
  const config = AI_AGENT_STEPS[key];
  const readSync = getSettingSync as unknown as (
    k: string,
    fallback: undefined,
  ) => number | undefined;
  const dbValue = readSync(config.key, undefined);

  let parsed = dbValue;
  if (parsed === undefined) {
    const envVal = process.env[config.env];
    if (envVal !== undefined && envVal !== "") {
      parsed = Number(envVal);
    }
  }

  if (parsed === undefined) {
    parsed = config.defaultSteps;
  }

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return config.defaultSteps;
  }

  return Math.min(
    config.maxSteps,
    Math.max(config.minSteps, Math.round(parsed)),
  );
}
