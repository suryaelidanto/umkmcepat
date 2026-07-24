import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listSnapshots } from "@/lib/projects/snapshots";

export const Route = createFileRoute("/api/projects/$id/snapshots")({
  server: {
    handlers: {
      // List a project's snapshots newest-first with build status + restorability.
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

        const snapshots = await listSnapshots(project.id);
        return Response.json({ snapshots });
      },
    },
  },
});
