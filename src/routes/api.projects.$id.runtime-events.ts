import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const Route = createFileRoute("/api/projects/$id/runtime-events")({
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

        const events = await prisma.runtimeEvent.findMany({
          where: { projectId: project.id },
          orderBy: { createdAt: "desc" },
          select: {
            buildId: true,
            createdAt: true,
            deploymentId: true,
            id: true,
            message: true,
            type: true,
          },
          take: 50,
        });

        return Response.json({ events });
      },
    },
  },
});
