import { generateText } from "ai";

import { getAiModel, getAiTelemetry } from "@/lib/ai/ai";
import {
  classifyAiError,
  recordAiCall,
  startAiCallTimer,
} from "@/lib/ai/ai-call-record";
import { getModerationModel } from "@/lib/ai/ai-models";
import { getAiTimeoutMs, withAiTimeout } from "@/lib/ai/ai-timeouts";
import { devLog } from "@/lib/dev-log";

export type ModerationResult =
  | {
      allowed: true;
      modelId?: string;
      usage: { inputTokens: number; outputTokens: number };
    }
  | {
      allowed: false;
      message: string;
      modelId?: string;
      usage: { inputTokens: number; outputTokens: number };
    };

export type ModerationImage = { bytes: Buffer; mediaType: string };

export type ModerationLedgerCorrelation = {
  projectId?: string;
  turnId?: string;
};

const BLOCK_MESSAGE =
  "Maaf, AI tidak bisa membantu membuat website untuk topik ini. Kamu bisa ubah chat dan coba lagi.";

const MODERATION_CACHE_TTL_MS = 30 * 60 * 1000;
const moderationCache = new Map<
  string,
  { expiresAt: number; result: ModerationResult }
>();

export async function moderateProjectRequest(
  prompt: string,
  images: ModerationImage[] = [],
  timeoutMs = getModerationTimeoutMs(),
  ledgerCorrelation?: ModerationLedgerCorrelation,
): Promise<ModerationResult> {
  const hasImages = images.length > 0;
  const key = normalizePrompt(prompt);
  const cached = hasImages ? undefined : moderationCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.result,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  devLog("moderation", "request-start", {
    promptHash: hashPrompt(key),
    model: getModerationModel(),
  });

  const contentParts: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: Buffer; mimeType?: string }
  > = [];
  if (prompt.trim()) {
    contentParts.push({ type: "text", text: prompt.trim() });
  }
  for (const image of images) {
    contentParts.push({
      type: "image",
      image: image.bytes,
      mimeType: image.mediaType,
    });
  }

  const requestedModel = getModerationModel();
  // Non-streaming generateText: ttftMs = requestMs on success (buffered
  const stopTimer = startAiCallTimer({ withTtft: true });
  let attemptedRetry = false;
  let result;
  try {
    result = await callWithRetry(
      () => {
        const abortController = new AbortController();
        return withAiTimeout(
          generateText({
            abortSignal: abortController.signal,
            maxOutputTokens: 256,
            model: getAiModel(requestedModel),
            temperature: 0,
            timeout: timeoutMs,
            telemetry: getAiTelemetry("project-moderation", {
              model: requestedModel,
            }),
            system:
              'You are a fast safety/profanity checker for UMKM Cepat, an AI website and app builder. Reply with exactly ALLOW or BLOCK. You screen one message from an ongoing conversation in which the assistant and the owner discuss website design, copy, feedback, and edits. Most messages are short answers or critique such as "ya", "iya", "boleh", "jelek", "kurang bagus", "ubah warnanya", "ganti foto", "bikin lebih keren", "Tunai", or "mahasiswa". ALWAYS ALLOW all design feedback, aesthetic critique (including negative feedback like "jelek", "buruk", "kurang rapi"), and normal small-business requests. ONLY BLOCK real harmful content: gambling, pornography, sexual services, fraud, phishing, illegal goods, weapons, violence, extremism, self-harm instructions, malware, and severe hate speech. When in doubt, reply ALLOW.',
            messages: [{ role: "user", content: contentParts }],
          }),
          "moderation",
          abortController,
          timeoutMs,
        );
      },
      () => {
        attemptedRetry = true;
      },
    );
  } catch (error) {
    recordAiCall({
      errorClass: classifyAiError(error),
      modelRequested: requestedModel,
      requestMs: stopTimer().requestMs,
      retryCount: attemptedRetry ? 1 : 0,
      status: /timed out|timeout|aborted/i.test(
        error instanceof Error ? error.message : String(error),
      )
        ? "timeout"
        : "error",
      task: "moderation",
      ...ledgerCorrelation,
    });
    throw error;
  }

  const usage = {
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
  };
  const modelId = result.response?.modelId || requestedModel;
  const timing = stopTimer({ nonStreaming: true });
  recordAiCall({
    inputTokens: usage.inputTokens,
    modelRequested: requestedModel,
    modelServed: result.response?.modelId,
    outputTokens: usage.outputTokens,
    requestMs: timing.requestMs,
    retryCount: attemptedRetry ? 1 : 0,
    status: "ok",
    task: "moderation",
    ttftMs: timing.ttftMs,
    ...ledgerCorrelation,
  });
  const label = result.text.trim().toUpperCase();
  if (!["ALLOW", "BLOCK"].includes(label)) {
    devLog("moderation", "unexpected-response", {
      raw: result.text,
      model: modelId,
    });
    return { allowed: true, modelId, usage };
  }

  const moderationResult: ModerationResult =
    label === "BLOCK"
      ? { allowed: false, message: BLOCK_MESSAGE, modelId, usage }
      : { allowed: true, modelId, usage };
  if (!moderationResult.allowed) {
    // A refused send creates no turn, so without this the message simply
    devLog("moderation", "refused", { label, model: modelId });
  }

  if (!hasImages) {
    moderationCache.set(key, {
      expiresAt: Date.now() + MODERATION_CACHE_TTL_MS,
      result: moderationResult,
    });
  }

  return moderationResult;
}

async function callWithRetry<T>(
  fn: () => Promise<T>,
  onRetry?: () => void,
): Promise<T> {
  try {
    return await fn();
  } catch (firstError) {
    console.error("[moderation] attempt-1 failed, retrying in 1s", {
      error: firstError instanceof Error ? firstError.message : firstError,
    });
    onRetry?.();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      return await fn();
    } catch (secondError) {
      console.error("[moderation] attempt-2 failed, giving up", {
        error: secondError instanceof Error ? secondError.message : secondError,
      });
      throw secondError;
    }
  }
}

export function getModerationTimeoutMs() {
  return getAiTimeoutMs("moderation");
}

function normalizePrompt(prompt: string) {
  return prompt.trim().replace(/\s+/g, " ").slice(0, 1_200);
}

function hashPrompt(prompt: string) {
  // Simple, stable fingerprint for correlation without logging raw prompt.
  let h = 0;
  for (let i = 0; i < prompt.length; i++) {
    h = (Math.imul(31, h) + prompt.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}
