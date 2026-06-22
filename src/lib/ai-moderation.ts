import { generateText } from "ai";

import { getAiModel } from "@/lib/ai";

export type ModerationResult =
  | { allowed: true }
  | { allowed: false; message: string };

const BLOCK_MESSAGE =
  "Maaf, AI tidak bisa membantu membuat website untuk topik ini. Kamu bisa ubah chat dan coba lagi.";

export async function moderateProjectRequest(
  prompt: string,
): Promise<ModerationResult> {
  const { text } = await generateText({
    model: getAiModel(),
    temperature: 0,
    system:
      "You are a strict safety classifier for UMKM Cepat, an AI website and app builder for small businesses. Reply with exactly ALLOW or BLOCK. Block requests involving gambling, pornography or sexual services, fraud, phishing, illegal goods, weapons, violence, extremism, self-harm instructions, or impersonation of real brands, people, or government entities. Allow normal small-business websites, landing pages, catalogs, menus, booking, contact forms, ordering flows, and calls to action.",
    prompt,
  });

  return text.trim().toUpperCase().startsWith("ALLOW")
    ? { allowed: true }
    : { allowed: false, message: BLOCK_MESSAGE };
}
