import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encodeSseEvent } from "@/lib/projects/build-attempt-pubsub";
import { readTurnState } from "@/lib/projects/discuss-turn-pubsub";
import { runDiscussProgressTail } from "@/lib/projects/discuss-turn-sse-tail";

const RESTART_RECOVERY_ERROR =
  "Server restart terputus. Coba jalankan chat lagi.";

export const Route = createFileRoute("/api/projects/$id/turns/$turnId/stream")({
  server: {
    handlers: {
      GET: ({ params }) => handleTurnStreamGet(params.id, params.turnId),
    },
  },
});

export async function handleTurnStreamGet(projectId: string, turnId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    select: { id: true },
  });
  if (!project) {
    return Response.json(
      { message: "Proyek tidak ditemukan." },
      { status: 404 },
    );
  }

  const turn = await prisma.projectChatTurn.findFirst({
    where: { id: turnId, projectId: project.id },
    select: { id: true, status: true, errorMessage: true },
  });
  if (!turn) {
    return Response.json({ message: "Turn tidak ditemukan." }, { status: 404 });
  }

  if (readTurnState(turnId) === "live") {
    return createDiscussReadStream(turnId, project.id);
  }

  // Channel gone: terminal from DB or fail-clean if still running (process death).
  const replay: Array<{ type: string; [key: string]: unknown }> = [];
  if (turn.status === "succeeded") {
    replay.push({ type: "finish" });
  } else if (turn.status === "failed" || turn.status === "cancelled") {
    replay.push({
      type: "error",
      errorText:
        turn.status === "cancelled"
          ? "Proses dihentikan."
          : (turn.errorMessage ?? "Obrolan belum selesai."),
    });
  } else {
    replay.push({ type: "error", errorText: RESTART_RECOVERY_ERROR });
  }

  return replayDiscussStream(replay);
}

function createDiscussReadStream(turnId: string, projectId: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const writeSafe = (event: { type: string; [key: string]: unknown }) => {
        try {
          controller.enqueue(encoder.encode(encodeSseEvent(event.type, event)));
        } catch {
          /* client gone */
        }
      };
      void runDiscussProgressTail({
        turnId,
        write: writeSafe,
        isTerminalDb: async () => {
          const turn = await prisma.projectChatTurn.findFirst({
            where: { id: turnId, projectId },
            select: { status: true, errorMessage: true },
          });
          if (!turn) {
            return { kind: "missing" as const };
          }
          if (turn.status === "running") {
            return { kind: "running" as const };
          }
          if (turn.status === "succeeded") {
            return { kind: "succeeded" as const };
          }
          if (turn.status === "cancelled") {
            return {
              kind: "cancelled" as const,
              errorText: "Proses dihentikan.",
            };
          }
          return {
            kind: "failed" as const,
            errorText:
              turn.errorMessage ??
              "Obrolan belum berhasil diproses. Coba kirim ulang ya.",
          };
        },
      }).finally(() => {
        try {
          controller.close();
        } catch {
          /* closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function replayDiscussStream(
  events: Array<{ type: string; [key: string]: unknown }>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          events.map((event) => encodeSseEvent(event.type, event)).join(""),
        ),
      );
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
