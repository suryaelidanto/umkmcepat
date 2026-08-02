import { getSettingSync } from "@/lib/app-settings";

export type AiTimeoutKey =
  | "buildSpec"
  | "chatCompaction"
  | "discuss"
  | "discussCard"
  | "discussOneCall"
  | "discussToolSettle"
  | "edit"
  | "editRepair"
  | "moderation"
  | "sourceGeneration";

export const DISCUSS_CARD_ATTEMPT_TIMEOUT_MS = 45_000;
/** One AI repair after primary; then text-only (no multi-repair cascade). */
export const DISCUSS_CARD_SEMANTIC_ATTEMPTS = 1;

export const DISCUSS_CARD_SERVER_DEADLINE_MS =
  DISCUSS_CARD_ATTEMPT_TIMEOUT_MS * DISCUSS_CARD_SEMANTIC_ATTEMPTS;

type AiTimeoutConfig = {
  key: string;
  defaultMs: number;
  env: string;
  maxMs: number;
  minMs: number;
};

const AI_TIMEOUTS = {
  moderation: {
    key: "ai.timeout.moderation_ms",
    env: "AI_TIMEOUT_MODERATION_MS",
    defaultMs: 30_000,
    minMs: 30_000,
    maxMs: 60_000,
  },
  discuss: {
    key: "ai.timeout.discuss_ms",
    env: "AI_TIMEOUT_DISCUSS_MS",
    defaultMs: 90_000,
    minMs: 30_000,
    maxMs: 180_000,
  },
  discussCard: {
    key: "ai.timeout.discuss_card_ms",
    env: "AI_TIMEOUT_DISCUSS_CARD_MS",
    defaultMs: DISCUSS_CARD_ATTEMPT_TIMEOUT_MS,
    minMs: 3_000,
    maxMs: 120_000,
  },
  discussOneCall: {
    key: "ai.timeout.discuss_one_call_ms",
    env: "AI_TIMEOUT_DISCUSS_ONE_CALL_MS",
    defaultMs: 120_000,
    minMs: 30_000,
    maxMs: 240_000,
  },
  discussToolSettle: {
    key: "ai.timeout.discuss_tool_settle_ms",
    env: "AI_TIMEOUT_DISCUSS_TOOL_SETTLE_MS",
    defaultMs: 30_000,
    minMs: 30_000,
    maxMs: 60_000,
  },
  chatCompaction: {
    key: "ai.timeout.chat_compaction_ms",
    env: "AI_TIMEOUT_CHAT_COMPACTION_MS",
    defaultMs: 60_000,
    minMs: 30_000,
    maxMs: 120_000,
  },
  buildSpec: {
    key: "ai.timeout.build_spec_ms",
    env: "AI_TIMEOUT_BUILD_SPEC_MS",
    defaultMs: 120_000,
    minMs: 30_000,
    maxMs: 240_000,
  },
  sourceGeneration: {
    key: "ai.timeout.source_generation_ms",
    env: "AI_TIMEOUT_SOURCE_GENERATION_MS",
    defaultMs: 600_000,
    minMs: 120_000,
    maxMs: 600_000,
  },
  edit: {
    key: "ai.timeout.edit_ms",
    env: "AI_TIMEOUT_EDIT_MS",
    defaultMs: 600_000,
    minMs: 60_000,
    maxMs: 600_000,
  },
  editRepair: {
    key: "ai.timeout.edit_repair_ms",
    env: "AI_TIMEOUT_EDIT_REPAIR_MS",
    defaultMs: 300_000,
    minMs: 60_000,
    maxMs: 600_000,
  },
} satisfies Record<AiTimeoutKey, AiTimeoutConfig>;

export function getAiTimeoutMs(key: AiTimeoutKey) {
  const config = AI_TIMEOUTS[key];
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
    parsed = config.defaultMs;
  }

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return config.defaultMs;
  }

  return Math.min(config.maxMs, Math.max(config.minMs, Math.round(parsed)));
}

export async function withAiTimeout<T>(
  promise: Promise<T>,
  key: AiTimeoutKey,
  abortController?: AbortController,
  timeoutMs = getAiTimeoutMs(key),
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          abortController?.abort();
          reject(new Error(`AI ${key} timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
