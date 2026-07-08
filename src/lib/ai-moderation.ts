import { generateText } from "ai";

import { getAiModel } from "@/lib/ai";

export type ModerationResult =
  | { allowed: true }
  | { allowed: false; message: string };

const BLOCK_MESSAGE =
  "Maaf, AI tidak bisa membantu membuat website untuk topik ini. Kamu bisa ubah chat dan coba lagi.";

export const AI_MODERATION_TIMEOUT_MS = 15_000;

export async function moderateProjectRequest(
  prompt: string,
  timeoutMs = AI_MODERATION_TIMEOUT_MS,
): Promise<ModerationResult> {
  const { text } = await withTimeout(
    generateText({
      model: getAiModel(),
      temperature: 0,
      system:
        "You are a strict safety classifier for UMKM Cepat, an AI website and app builder for small businesses. Reply with exactly ALLOW or BLOCK. Block requests involving gambling, pornography or sexual services, fraud, phishing, illegal goods, weapons, violence, extremism, self-harm instructions, or impersonation of real brands, people, or government entities. Allow normal small-business websites, landing pages, catalogs, menus, booking, contact forms, ordering flows, and calls to action.",
      prompt,
    }),
    timeoutMs,
  );

  return text.trim().toUpperCase().startsWith("ALLOW")
    ? { allowed: true }
    : { allowed: false, message: BLOCK_MESSAGE };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("AI moderation timed out.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
