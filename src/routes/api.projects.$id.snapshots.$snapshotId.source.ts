import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readSnapshotFile } from "@/lib/projects/snapshots";

export const Route = createFileRoute(
  "/api/projects/$id/snapshots/$snapshotId/source",
)({
  server: {
    handlers: {
      // Read a single file's content from a specific snapshot (owner-scoped).
      GET: async ({ request, params }) => {
        const session = await auth();
        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const { id, snapshotId } = params;
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

        // Ensure the snapshot belongs to this project before reading.
        const snapshot = await prisma.projectSnapshot.findFirst({
          where: { id: snapshotId, projectId: project.id },
          select: { id: true },
        });
        if (!snapshot) {
          return Response.json(
            { message: "Riwayat tidak ditemukan." },
            { status: 404 },
          );
        }

        const filePath = new URL(request.url).searchParams.get("path") ?? "";
        const file = await readSnapshotFile(snapshotId, filePath);
        if (!file) {
          return Response.json(
            { message: "File tidak ditemukan pada riwayat ini." },
            { status: 404 },
          );
        }
        return Response.json({ content: file.content });
      },
    },
  },
});
