import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveDiscussTurn } from "@/lib/projects/discuss-turn";

export const Route = createFileRoute("/api/projects/$id/chat/turn")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const session = await auth();

        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const { id } = params;
        const project = await prisma.project.findFirst({
          where: { id, userId: session.user.id },
          select: { id: true },
        });

        if (!project) {
          return Response.json(
            { message: "Proyek tidak ditemukan." },
            { status: 404 },
          );
        }

        // Prefer a live running turn (client will tail the stream).
        // Fall back to the latest finished turn by startedAt desc so the
        // client can replay success / offer retry on failure.
        const active = await getActiveDiscussTurn({ projectId: project.id });
        const turn =
          active ??
          (await prisma.projectChatTurn.findFirst({
            where: { projectId: project.id },
            orderBy: { startedAt: "desc" },
          }));

        if (!turn) {
          return Response.json(
            { message: "Belum ada putaran obrolan untuk proyek ini." },
            { status: 404 },
          );
        }

        const body: {
          turnId: string;
          status: string;
          userMessageId: string;
          errorMessage?: string;
        } = {
          turnId: turn.id,
          status: turn.status,
          userMessageId: turn.userMessageId,
        };
        if (turn.errorMessage) {
          body.errorMessage = turn.errorMessage;
        }
        return Response.json(body);
      },
    },
  },
});
