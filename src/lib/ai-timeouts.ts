import { getEnv } from "@/lib/config";

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
export const DISCUSS_CARD_SEMANTIC_ATTEMPTS = 3;

export const DISCUSS_CARD_SERVER_DEADLINE_MS =
  DISCUSS_CARD_ATTEMPT_TIMEOUT_MS * DISCUSS_CARD_SEMANTIC_ATTEMPTS;

type AiTimeoutConfig = {
  defaultMs: number;
  env: string;
  maxMs: number;
  minMs: number;
};

const AI_TIMEOUTS = {
  moderation: {
    env: "AI_TIMEOUT_MODERATION_MS",
    defaultMs: 30_000,
    minMs: 30_000,
    maxMs: 60_000,
  },
  discuss: {
    env: "AI_TIMEOUT_DISCUSS_MS",
    defaultMs: 90_000,
    minMs: 30_000,
    maxMs: 180_000,
  },
  discussCard: {
    env: "AI_TIMEOUT_DISCUSS_CARD_MS",
    defaultMs: DISCUSS_CARD_ATTEMPT_TIMEOUT_MS,
    minMs: 3_000,
    maxMs: 120_000,
  },
  discussOneCall: {
    env: "AI_TIMEOUT_DISCUSS_ONE_CALL_MS",
    defaultMs: 120_000,
    minMs: 30_000,
    maxMs: 240_000,
  },
  discussToolSettle: {
    env: "AI_TIMEOUT_DISCUSS_TOOL_SETTLE_MS",
    defaultMs: 30_000,
    minMs: 30_000,
    maxMs: 60_000,
  },
  chatCompaction: {
    env: "AI_TIMEOUT_CHAT_COMPACTION_MS",
    defaultMs: 60_000,
    minMs: 30_000,
    maxMs: 120_000,
  },
  buildSpec: {
    env: "AI_TIMEOUT_BUILD_SPEC_MS",
    defaultMs: 120_000,
    minMs: 30_000,
    maxMs: 240_000,
  },
  sourceGeneration: {
    env: "AI_TIMEOUT_SOURCE_GENERATION_MS",
    defaultMs: 600_000,
    minMs: 120_000,
    maxMs: 900_000,
  },
  edit: {
    env: "AI_TIMEOUT_EDIT_MS",
    defaultMs: 300_000,
    minMs: 60_000,
    maxMs: 600_000,
  },
  editRepair: {
    env: "AI_TIMEOUT_EDIT_REPAIR_MS",
    defaultMs: 300_000,
    minMs: 60_000,
    maxMs: 600_000,
  },
} satisfies Record<AiTimeoutKey, AiTimeoutConfig>;

export function getAiTimeoutMs(key: AiTimeoutKey) {
  const config = AI_TIMEOUTS[key];
  const raw = getEnv(config.env);

  if (!raw) {
    return config.defaultMs;
  }

  const parsed = Number(raw);

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
