import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { abortAttemptJob } from "@/lib/projects/attempt-queue";
import { publishBuildProgress } from "@/lib/projects/build-attempt-pubsub";
import { finalizeDiscussTurn } from "@/lib/projects/discuss-turn";
import { publishProgress } from "@/lib/projects/discuss-turn-pubsub";
import { verifyProjectOwnership } from "@/middleware/ownership";

export const Route = createFileRoute("/api/projects/$id/cancel")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const session = await auth();

        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const { id } = params;
        const isOwner = await verifyProjectOwnership(id, session.user.id);

        if (!isOwner) {
          return Response.json(
            { message: "Proyek tidak ditemukan." },
            { status: 404 },
          );
        }

        const openAttempts = await prisma.projectEditAttempt.findMany({
          where: {
            finishedAt: null,
            projectId: id,
            status: {
              in: ["generating", "editing", "repairing", "building"],
            },
          },
          select: { id: true },
        });

        const openTurns = await prisma.projectChatTurn.findMany({
          where: { projectId: id, status: "running" },
          select: { id: true },
        });

        for (const attempt of openAttempts) {
          abortAttemptJob(attempt.id);
          publishBuildProgress(attempt.id, {
            type: "error",
            detail: "Proses dihentikan.",
          });
        }

        for (const turn of openTurns) {
          abortAttemptJob(turn.id);
          publishProgress(turn.id, {
            type: "error",
            errorText: "Proses dihentikan.",
          });
          await finalizeDiscussTurn({
            turnId: turn.id,
            status: "cancelled",
            errorMessage: "Dihentikan oleh pengguna.",
          }).catch(() => undefined);
        }

        await prisma.project.updateMany({
          where: { id, userId: session.user.id },
          data: {
            activeOperationExpiresAt: null,
            activeOperationKind: null,
            activeOperationToken: null,
            buildLog: "Build dihentikan oleh pengguna.",
            buildStatus: "canceled",
            status: "failed",
          },
        });

        await prisma.projectBuild.updateMany({
          where: {
            projectId: id,
            status: { in: ["queued", "running"] },
          },
          data: {
            finishedAt: new Date(),
            logText: "Build dihentikan oleh pengguna.",
            status: "canceled",
          },
        });

        await prisma.projectEditAttempt.updateMany({
          where: {
            finishedAt: null,
            projectId: id,
            status: {
              in: ["generating", "editing", "repairing", "building"],
            },
          },
          data: {
            errorMessage: "Dihentikan oleh pengguna.",
            finishedAt: new Date(),
            status: "canceled",
          },
        });

        return Response.json({ ok: true });
      },
    },
  },
});
