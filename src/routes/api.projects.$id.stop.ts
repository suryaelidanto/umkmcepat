import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import { getRuntimeSupervisor } from "@/lib/projects/runtime-supervisor";
import { verifyProjectOwnership } from "@/middleware/ownership";

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
        const isOwner = await verifyProjectOwnership(id, session.user.id);

        if (!isOwner) {
          return Response.json(
            { message: "Proyek tidak ditemukan." },
            { status: 404 },
          );
        }

        await prisma.project.update({
          where: { id },
          data: { status: "stopping" },
        });
        const deployment = await prisma.projectDeployment.findFirst({
          where: {
            kind: "preview",
            projectId: id,
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
