import {
  convertToModelMessages,
  streamText,
  type UIMessage,
  validateUIMessages,
} from "ai";

import { getAiModel } from "@/lib/ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getProjectChatContext,
  parseProjectChatMessages,
} from "@/lib/projects/chat-memory";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;

const systemPrompt = `Kamu konsultan website UMKM Indonesia.
Tulis dalam bahasa Indonesia yang jelas dan praktis.
Jangan tampilkan chain-of-thought internal.
Ingat konteks chat sebelumnya dalam proyek ini.
Untuk mode Diskusi, jangan membuat website. Bantu user memperjelas kebutuhan dengan 1-2 pertanyaan berikutnya dan ringkasan singkat.
Untuk mode Buat, bantu user memberi arahan perubahan website yang spesifik, bukan membuat kode.`;

type PreviewRequest = {
  message?: UIMessage;
  messages?: UIMessage[];
  mode?: "discuss" | "build";
  projectId?: string;
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

  const body = (await request.json().catch(() => ({}))) as PreviewRequest;
  const mode = body.mode === "build" ? "build" : "discuss";

  if (!body.projectId) {
    return Response.json({ message: "Proyek tidak valid." }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, userId: session.user.id },
    select: { id: true },
  });

  if (!project) {
    return Response.json(
      { message: "Proyek tidak ditemukan." },
      { status: 404 },
    );
  }

  const [chatRow] = await prisma.$queryRaw<[{ chatMessages: unknown }]>`
    SELECT "chatMessages" FROM "Project" WHERE id = ${project.id} AND "userId" = ${session.user.id}
  `;
  const storedMessages = parseProjectChatMessages(chatRow?.chatMessages);
  const incoming = body.message ? [body.message] : (body.messages ?? []);

  if (!incoming.length) {
    return Response.json(
      { message: "Pesan tidak boleh kosong." },
      { status: 400 },
    );
  }

  const messages = await validateUIMessages({
    messages: [...storedMessages, ...incoming],
  });
  const contextMessages = getProjectChatContext(messages);

  const result = streamText({
    model: getAiModel(),
    system: `${systemPrompt}\n\nMode aktif: ${mode === "build" ? "Buat" : "Diskusi"}.`,
    messages: await convertToModelMessages(contextMessages),
  });

  result.consumeStream();

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages }) => {
      await prisma.$executeRaw`
        UPDATE "Project" SET "chatMessages" = ${JSON.stringify(messages)}::jsonb WHERE id = ${project.id}
      `;
    },
  });
}
