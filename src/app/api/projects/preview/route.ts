import { convertToModelMessages, streamText, type UIMessage } from "ai";

import { getAiModel } from "@/lib/ai";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;

const systemPrompt = `Kamu konsultan website UMKM Indonesia.
Tulis dalam bahasa Indonesia yang jelas dan praktis.
Jangan tampilkan chain-of-thought internal.
Untuk mode Diskusi, bantu user memperjelas kebutuhan dengan 1-2 pertanyaan berikutnya dan ringkasan singkat.
Untuk mode Buat, susun draft landing page ringkas: judul, value proposition, bagian halaman, CTA WhatsApp, dan asumsi yang dipakai.`;

type PreviewRequest = {
  messages: UIMessage[];
  mode?: "discuss" | "build";
};

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const rateLimitResponse = await checkRateLimit(request, "ai");

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { messages, mode = "discuss" } =
    (await request.json()) as PreviewRequest;

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { message: "Pesan tidak boleh kosong." },
      { status: 400 },
    );
  }

  const result = streamText({
    model: getAiModel(),
    system: `${systemPrompt}\n\nMode aktif: ${mode === "build" ? "Buat" : "Diskusi"}.`,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
