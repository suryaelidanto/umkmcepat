import { generateText } from "ai";

import { getAiModel } from "@/lib/ai";
import { getDefaultAiModel } from "@/lib/ai-models";
import { getEnv } from "@/lib/config";

export type ModerationResult =
  | { allowed: true }
  | { allowed: false; message: string };

const BLOCK_MESSAGE =
  "Maaf, AI tidak bisa membantu membuat website untuk topik ini. Kamu bisa ubah chat dan coba lagi.";
const CLARIFY_MESSAGE =
  "Checker keamanan lagi lambat. Coba kirim lagi sebentar ya.";

export const AI_MODERATION_TIMEOUT_MS = 2_500;
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
  const { text } = await withTimeout(
    generateText({
      abortSignal: abortController.signal,
      maxOutputTokens: 4,
      model: getAiModel(getModerationModel()),
      temperature: 0,
      timeout: timeoutMs,
      system:
        "You are a fast safety/profanity checker for UMKM Cepat, an AI website and app builder. Reply with exactly ALLOW, BLOCK, or CLARIFY. BLOCK gambling, pornography, sexual services, fraud, phishing, illegal goods, weapons, violence, extremism, self-harm instructions, malware, abusive impersonation of real brands/people/government, and explicit hateful/sexual profanity. CLARIFY only when intent is unclear but potentially unsafe. ALLOW normal small-business websites, landing pages, catalogs, menus, booking intent, contact forms, ordering flows, and calls to action.",
      prompt: key,
    }),
    timeoutMs,
    abortController,
  );

  const label = text.trim().toUpperCase();
  const result: ModerationResult = label.startsWith("ALLOW")
    ? { allowed: true }
    : label.startsWith("BLOCK")
      ? { allowed: false, message: BLOCK_MESSAGE }
      : { allowed: false, message: CLARIFY_MESSAGE };

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
  const value = Number(getEnv("AI_MODERATION_TIMEOUT_MS", "2500"));

  return Number.isFinite(value) && value > 0
    ? Math.min(10_000, Math.round(value))
    : AI_MODERATION_TIMEOUT_MS;
}

function normalizePrompt(prompt: string) {
  return prompt.trim().replace(/\s+/g, " ").slice(0, 1_200);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  abortController: AbortController,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          abortController.abort();
          reject(new Error("AI moderation timed out."));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
