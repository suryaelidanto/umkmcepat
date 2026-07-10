import { generateText } from "ai";

import { getAiModel, getAiTelemetry } from "@/lib/ai";
import { getDefaultAiModel } from "@/lib/ai-models";
import { getAiTimeoutMs, withAiTimeout } from "@/lib/ai-timeouts";
import { getEnv } from "@/lib/config";

export type ModerationResult =
  { allowed: true } | { allowed: false; message: string };

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
    return cached.result;
  }

  const abortController = new AbortController();
  const { text } = await withAiTimeout(
    generateText({
      abortSignal: abortController.signal,
      maxOutputTokens: 4,
      model: getAiModel(getModerationModel()),
      temperature: 0,
      timeout: timeoutMs,
      experimental_telemetry: getAiTelemetry("project-moderation", {
        model: getModerationModel(),
      }),
      system:
        "You are a fast safety/profanity checker for UMKM Cepat, an AI website and app builder. Reply with exactly ALLOW, BLOCK, or CLARIFY. BLOCK gambling, pornography, sexual services, fraud, phishing, illegal goods, weapons, violence, extremism, self-harm instructions, malware, abusive impersonation of real brands/people/government, and explicit hateful/sexual profanity. CLARIFY only when intent is unclear but potentially unsafe. ALLOW normal small-business websites, landing pages, catalogs, menus, booking intent, contact forms, ordering flows, and calls to action.",
      prompt: key,
    }),
    "moderation",
    abortController,
    timeoutMs,
  );

  const label = text.trim().toUpperCase();
  const result: ModerationResult = label.startsWith("BLOCK")
    ? { allowed: false, message: BLOCK_MESSAGE }
    : label.startsWith("CLARIFY")
      ? { allowed: false, message: CLARIFY_MESSAGE }
      : { allowed: true };

  moderationCache.set(key, {
    expiresAt: Date.now() + MODERATION_CACHE_TTL_MS,
    result,
  });

  return result;
}

export function getModerationModel() {
  return getEnv("AI_MODERATION_MODEL", getDefaultAiModel());
}

function getModerationTimeoutMs() {
  return getAiTimeoutMs("moderation");
}

function normalizePrompt(prompt: string) {
  return prompt.trim().replace(/\s+/g, " ").slice(0, 1_200);
}
