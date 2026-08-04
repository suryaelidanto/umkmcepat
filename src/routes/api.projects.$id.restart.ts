import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRuntimeSupervisor } from "@/lib/projects/runtime-supervisor";
import { verifyProjectOwnership } from "@/middleware/ownership";

export const Route = createFileRoute("/api/projects/$id/restart")({
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

        const deployment = await prisma.projectDeployment.findFirst({
          where: { kind: "preview", projectId: id },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });

        if (!deployment) {
          return Response.json(
            { message: "Jalankan build dulu untuk menampilkan website." },
            { status: 404 },
          );
        }

        const supervisor = getRuntimeSupervisor();
        await supervisor.stopDeployment(deployment.id);
        await supervisor.startDeployment(deployment.id);

        return Response.json({ ok: true });
      },
    },
  },
});
