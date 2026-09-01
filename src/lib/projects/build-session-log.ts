import { type UIMessage } from "ai";

import { parseProjectChatMessages } from "./chat-memory";

import { prisma } from "@/lib/prisma";

export type BuildSessionLogEntry = {
  attemptId: string;
  failed: boolean;
  projectId: string;
  skillsRead: string[];
  stopped?: boolean;
  touchedFiles: string[];
  userId: string;
};

export function buildBuildSessionLogMessage(
  entry: BuildSessionLogEntry,
): UIMessage {
  const fileCount = entry.touchedFiles.length;
  const text = entry.stopped
    ? "Pembuatan website dihentikan. Bagian yang sudah jadi tetap tersimpan."
    : entry.failed
      ? "Percobaan pembuatan website belum selesai. Riwayatnya tetap tersimpan di sini — lanjutkan kapan saja."
      : `Website selesai dibuat. ${fileCount} bagian diperbarui${
          entry.skillsRead.length
            ? ` setelah mempelajari ${entry.skillsRead.length} panduan desain`
            : ""
        }.`;

  return {
    id: `build-${entry.attemptId}`,
    parts: [
      { type: "text", text },
      {
        data: {
          attemptId: entry.attemptId,
          failed: entry.failed,
          skillsRead: entry.skillsRead.slice(0, 20),
          stopped: Boolean(entry.stopped),
          touchedFiles: entry.touchedFiles.slice(0, 40),
        },
        type: "data-buildSessionLog",
      },
    ],
    role: "assistant",
  } as UIMessage;
}

export async function appendBuildSessionLog(
  entry: BuildSessionLogEntry,
): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ chatMessages: unknown }>>`
    SELECT "chatMessages" FROM "Project" WHERE id = ${entry.projectId} AND "userId" = ${entry.userId}
  `;
  const messages = parseProjectChatMessages(rows[0]?.chatMessages);
  const messageId = `build-${entry.attemptId}`;
  if (messages.some((message) => message.id === messageId)) {
    return;
  }

  await prisma.$executeRaw`
    UPDATE "Project" SET "chatMessages" = ${JSON.stringify([
      ...messages,
      buildBuildSessionLogMessage(entry),
    ])}::jsonb WHERE id = ${entry.projectId} AND "userId" = ${entry.userId}
  `;
}
