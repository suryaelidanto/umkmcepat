import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createReadStreamFromChannel,
  encodeSseEvent,
  readBuildProgressState,
  type BuildProgressEvent,
} from "@/lib/projects/build-attempt-pubsub";

const RESTART_RECOVERY_ERROR_DETAIL =
  "Server restart terputus. Coba jalankan build lagi.";

export const Route = createFileRoute(
  "/api/projects/$id/attempts/$attemptId/stream",
)({
  server: {
    handlers: {
      GET: ({ params }) => handleAttemptStreamGet(params.id, params.attemptId),
    },
  },
});

export async function handleAttemptStreamGet(
  projectId: string,
  attemptId: string,
) {
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

  if (readBuildProgressState(attemptId) === "live") {
    return createReadStreamFromChannel(attemptId);
  }

  const attempt = await prisma.projectEditAttempt.findFirst({
    where: { id: attemptId, projectId: project.id, userId: session.user.id },
    select: { id: true, status: true },
  });
  if (!attempt) {
    return Response.json(
      { message: "Build attempt tidak ditemukan." },
      { status: 404 },
    );
  }

  const events = await prisma.runtimeEvent.findMany({
    where: { buildId: attemptId, type: "build.progress" },
    orderBy: { createdAt: "asc" },
    select: { message: true, metadata: true },
  });

  const replay: BuildProgressEvent[] = events.map((row) => {
    const metadata = (row.metadata ?? {}) as {
      detail?: string;
      label?: string;
    };
    return {
      type: "progress",
      detail: metadata.detail ?? "",
      label: metadata.label ?? row.message ?? "",
    };
  });

  if (attempt.status === "succeeded") {
    replay.push({ type: "done" });
  } else if (attempt.status === "failed" || attempt.status === "canceled") {
    replay.push({
      type: "error",
      detail:
        attempt.status === "canceled"
          ? "Proses dihentikan."
          : "Build belum selesai.",
    });
  } else {
    replay.push({ type: "error", detail: RESTART_RECOVERY_ERROR_DETAIL });
  }

  return replayStream(replay);
}

function replayStream(events: BuildProgressEvent[]): Response {
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
