import {
  convertToModelMessages,
  streamText,
  type UIMessage,
  validateUIMessages,
} from "ai";

import { getAiModel } from "@/lib/ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseProjectBrief } from "@/lib/projects/brief";
import {
  generateNextWorkspaceCard,
  updateBriefFromAnswer,
} from "@/lib/projects/brief-flow";
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
Untuk mode Diskusi, jangan membuat website. Utamakan memperjelas brief sampai sekitar 80% jelas sebelum menyarankan build.
Boleh tanya satu pertanyaan atau beberapa pertanyaan sekaligus kalau memang dibutuhkan. Kalau memberi opsi, format jelas sebagai A/B/C/D/Lainnya.
Jangan mengulang pertanyaan yang sudah terjawab dari konteks chat.
Kalau user mengulang permintaan build tanpa menjawab, jangan membuat contoh website, jangan menulis kode, dan jangan mengganti topik. Ulangi pertanyaan yang masih wajib dengan lebih ringkas.
Jangan pernah mengirim HTML/CSS/JS mentah di chat. Platform ini yang akan membangun preview.
Kalau brief sudah cukup jelas, tampilkan rencana singkat dan sarankan user klik tombol build.
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

  const userId = session.user.id;
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
    where: { id: body.projectId, userId },
    select: { id: true, status: true, prompt: true },
  });

  if (!project) {
    return Response.json(
      { message: "Proyek tidak ditemukan." },
      { status: 404 },
    );
  }

  if (project.status === "building") {
    return Response.json(
      {
        message:
          "AI sedang membangun. Tunggu sampai selesai atau hentikan dulu.",
      },
      { status: 409 },
    );
  }

  const [chatRow] = await prisma.$queryRaw<
    [{ chatMessages: unknown; brief: unknown }]
  >`
    SELECT "chatMessages", "brief" FROM "Project" WHERE id = ${project.id} AND "userId" = ${userId}
  `;
  const storedMessages = parseProjectChatMessages(chatRow?.chatMessages);
  const incoming = body.message ? [body.message] : (body.messages ?? []);
  const latestUserText = incoming
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ");
  const updatedBrief = updateBriefFromAnswer(
    parseProjectBrief(chatRow?.brief, project.prompt),
    latestUserText,
  );
  const workspaceCard = await generateNextWorkspaceCard(updatedBrief);

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
    system: `${systemPrompt}\n\nMode aktif: ${mode === "build" ? "Buat" : "Diskusi"}.\n\nBrief saat ini:\n${JSON.stringify(updatedBrief)}\n\nKartu berikutnya:\n${JSON.stringify(workspaceCard)}\n\nIkuti kartu berikutnya. Jangan membuat kartu berbeda.`,
    messages: await convertToModelMessages(contextMessages),
  });

  result.consumeStream();

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages }) => {
      await prisma.$executeRaw`
        UPDATE "Project" SET "chatMessages" = ${JSON.stringify(messages)}::jsonb, "brief" = ${JSON.stringify(updatedBrief)}::jsonb, "workspaceCard" = ${JSON.stringify(workspaceCard)}::jsonb WHERE id = ${project.id} AND "userId" = ${userId}
      `;
    },
  });
}
