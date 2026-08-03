import { generateText } from "ai";

import { getAiModel, getAiTelemetry } from "@/lib/ai";
import { getModerationModel } from "@/lib/ai-models";
import { getAiTimeoutMs, withAiTimeout } from "@/lib/ai-timeouts";
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

const BLOCK_MESSAGE =
  "Maaf, AI tidak bisa membantu membuat website untuk topik ini. Kamu bisa ubah chat dan coba lagi.";
const CLARIFY_MESSAGE =
  "Checker keamanan lagi lambat. Coba kirim lagi sebentar ya.";

const MODERATION_CACHE_TTL_MS = 30 * 60 * 1000;
const moderationCache = new Map<
  string,
  { expiresAt: number; result: ModerationResult }
>();

export async function moderateProjectRequest(
  prompt: string,
  images: ModerationImage[] = [],
  timeoutMs = getModerationTimeoutMs(),
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
    | { type: "file"; data: Buffer; mediaType: string }
  > = [];
  if (prompt.trim()) {
    contentParts.push({ type: "text", text: prompt.trim() });
  }
  for (const image of images) {
    contentParts.push({
      type: "file",
      data: image.bytes,
      mediaType: image.mediaType,
    });
  }

  const result = await callWithRetry(() => {
    const abortController = new AbortController();
    return withAiTimeout(
      generateText({
        abortSignal: abortController.signal,
        maxOutputTokens: 256,
        model: getAiModel(getModerationModel()),
        temperature: 0,
        timeout: timeoutMs,
        telemetry: getAiTelemetry("project-moderation", {
          model: getModerationModel(),
        }),
        system:
          "You are a fast safety/profanity checker for UMKM Cepat, an AI website and app builder. Reply with exactly ALLOW, BLOCK, or CLARIFY. BLOCK gambling, pornography, sexual services, fraud, phishing, illegal goods, weapons, violence, extremism, self-harm instructions, malware, abusive impersonation of real brands/people/government, and explicit hateful/sexual profanity. CLARIFY only when intent is unclear but potentially unsafe. ALLOW normal small-business websites, landing pages, catalogs, menus, booking intent, contact forms, ordering flows, and calls to action.",
        messages: [{ role: "user", content: contentParts }],
      }),
      "moderation",
      abortController,
      timeoutMs,
    );
  });

  const usage = {
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
  };
  const modelId = result.response?.modelId || getModerationModel();
  const label = result.text.trim().toUpperCase();
  if (!["ALLOW", "BLOCK", "CLARIFY"].includes(label)) {
    devLog("moderation", "unexpected-response", {
      raw: result.text,
      model: modelId,
    });
    return { allowed: true, modelId, usage };
  }

  const moderationResult: ModerationResult =
    label === "BLOCK"
      ? { allowed: false, message: BLOCK_MESSAGE, modelId, usage }
      : label === "CLARIFY"
        ? { allowed: false, message: CLARIFY_MESSAGE, modelId, usage }
        : { allowed: true, modelId, usage };

  if (!hasImages) {
    moderationCache.set(key, {
      expiresAt: Date.now() + MODERATION_CACHE_TTL_MS,
      result: moderationResult,
    });
  }

  return moderationResult;
}

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (firstError) {
    console.error("[moderation] attempt-1 failed, retrying in 1s", {
      error: firstError instanceof Error ? firstError.message : firstError,
    });
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
