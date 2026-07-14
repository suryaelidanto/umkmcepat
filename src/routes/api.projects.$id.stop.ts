import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRuntimeSupervisor } from "@/lib/projects/runtime-supervisor";

export const Route = createFileRoute("/api/projects/$id/stop")({
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

        await prisma.project.update({
          where: { id: project.id },
          data: { status: "stopping" },
        });
        const deployment = await prisma.projectDeployment.findFirst({
          where: {
            kind: "preview",
            projectId: project.id,
            status: { in: ["running", "starting"] },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });

        if (deployment) {
          await getRuntimeSupervisor().stopDeployment(deployment.id);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
