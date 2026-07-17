import { generateText } from "ai";

import { getAiModel, getAiTelemetry } from "@/lib/ai";
import { getDefaultAiModel } from "@/lib/ai-models";
import { getAiTimeoutMs, withAiTimeout } from "@/lib/ai-timeouts";

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
  timeoutMs = getModerationTimeoutMs(),
): Promise<ModerationResult> {
  const key = normalizePrompt(prompt);
  const cached = moderationCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.result,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  const abortController = new AbortController();
  const result = await withAiTimeout(
    generateText({
      abortSignal: abortController.signal,
      maxOutputTokens: 256,
      model: getAiModel(getDefaultAiModel()),
      temperature: 0,
      timeout: timeoutMs,
      telemetry: getAiTelemetry("project-moderation", {
        model: getDefaultAiModel(),
      }),
      system:
        "You are a fast safety/profanity checker for UMKM Cepat, an AI website and app builder. Reply with exactly ALLOW, BLOCK, or CLARIFY. BLOCK gambling, pornography, sexual services, fraud, phishing, illegal goods, weapons, violence, extremism, self-harm instructions, malware, abusive impersonation of real brands/people/government, and explicit hateful/sexual profanity. CLARIFY only when intent is unclear but potentially unsafe. ALLOW normal small-business websites, landing pages, catalogs, menus, booking intent, contact forms, ordering flows, and calls to action.",
      prompt: key,
    }),
    "moderation",
    abortController,
    timeoutMs,
  );

  const usage = {
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
  };
  const modelId = result.response?.modelId || getDefaultAiModel();
  const label = result.text.trim().toUpperCase();
  if (!["ALLOW", "BLOCK", "CLARIFY"].includes(label)) {
    console.warn(
      `[moderation] unexpected model response: ${JSON.stringify(result.text)} — defaulting to ALLOW`,
    );
    return { allowed: true, modelId, usage };
  }

  const moderationResult: ModerationResult =
    label === "BLOCK"
      ? { allowed: false, message: BLOCK_MESSAGE, modelId, usage }
      : label === "CLARIFY"
        ? { allowed: false, message: CLARIFY_MESSAGE, modelId, usage }
        : { allowed: true, modelId, usage };

  moderationCache.set(key, {
    expiresAt: Date.now() + MODERATION_CACHE_TTL_MS,
    result: moderationResult,
  });

  return moderationResult;
}

export function getModerationTimeoutMs() {
  return getAiTimeoutMs("moderation");
}

function normalizePrompt(prompt: string) {
  return prompt.trim().replace(/\s+/g, " ").slice(0, 1_200);
}
