import { type UIMessage } from "ai";

import { parseProjectChatMessages } from "./chat-memory";

import { prisma } from "@/lib/prisma";

export type BuildSessionLogOperation = {
  detail: string;
  id: string;
  path?: string;
  state: "succeeded" | "failed" | "active";
  title: string;
  type: string;
};

export type BuildSessionLogEntry = {
  attemptId: string;
  failed: boolean;
  kind?: "build" | "edit";
  projectId: string;
  skillDigestVersion?: string;
  skillsRead: string[];
  stopped?: boolean;
  touchedFiles: string[];
  operations?: BuildSessionLogOperation[];
  userId: string;
};

export function buildBuildSessionLogMessage(
  entry: BuildSessionLogEntry,
): UIMessage {
  const fileCount = entry.touchedFiles.length;
  const isEdit = entry.kind === "edit";
  const text = entry.stopped
    ? `${isEdit ? "Pembaruan website" : "Pembuatan website"} dihentikan. Bagian yang sudah jadi tetap tersimpan.`
    : entry.failed
      ? `${isEdit ? "Percobaan pembaruan website" : "Percobaan pembuatan website"} belum selesai. Riwayatnya tetap tersimpan di sini — lanjutkan kapan saja.`
      : `${isEdit ? "Perubahan website selesai diterapkan" : "Website selesai dibuat"}. ${fileCount} bagian diperbarui${
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
          kind: entry.kind ?? "build",
          skillDigestVersion: entry.skillDigestVersion,
          skillsRead: entry.skillsRead.slice(0, 20),
          stopped: Boolean(entry.stopped),
          touchedFiles: entry.touchedFiles.slice(0, 40),
          operations:
            entry.operations?.slice(0, 60).map((operation) => ({
              detail: operation.detail.slice(0, 280),
              id: operation.id.slice(0, 80),
              ...(operation.path ? { path: operation.path.slice(0, 240) } : {}),
              state: operation.state,
              title: operation.title.slice(0, 160),
              type: operation.type.slice(0, 80),
            })) ?? [],
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
  await prisma.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<Array<{ chatMessages: unknown }>>`
      SELECT "chatMessages" FROM "Project"
      WHERE id = ${entry.projectId} AND "userId" = ${entry.userId}
      FOR UPDATE
    `;
    const messages = parseProjectChatMessages(rows[0]?.chatMessages);
    const messageId = `build-${entry.attemptId}`;
    if (messages.some((message) => message.id === messageId)) {
      return;
    }

    await transaction.$executeRaw`
      UPDATE "Project" SET "chatMessages" = ${JSON.stringify([
        ...messages,
        buildBuildSessionLogMessage(entry),
      ])}::jsonb WHERE id = ${entry.projectId} AND "userId" = ${entry.userId}
    `;
  });
}
