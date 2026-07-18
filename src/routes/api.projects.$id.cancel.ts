import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

        await prisma.project.updateMany({
          where: { id: project.id, userId: session.user.id },
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
            projectId: project.id,
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
            projectId: project.id,
            status: { in: ["generating", "editing", "repairing", "building"] },
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
