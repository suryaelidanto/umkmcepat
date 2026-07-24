import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import { restoreSnapshot } from "@/lib/projects/snapshots";

export const Route = createFileRoute(
  "/api/projects/$id/snapshots/$snapshotId/restore",
)({
  server: {
    handlers: {
      // Restore a snapshot by branching from it (append-only). The target and
      // all newer snapshots remain; a new ProjectSnapshot is created whose
      // parent points at the target. The caller may rebuild off the new snapshot.
      POST: async ({ params }) => {
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

        const snapshot = await prisma.projectSnapshot.findFirst({
          where: { id: snapshotId, projectId: project.id },
          select: { id: true, files: true, sourceRef: true },
        });
        if (!snapshot) {
          return Response.json(
            { message: "Riwayat tidak ditemukan." },
            { status: 404 },
          );
        }

        // Only restorable snapshots (files or sourceRef present) can branch.
        const restorable =
          (Array.isArray(snapshot.files) && snapshot.files.length > 0) ||
          Boolean(snapshot.sourceRef);
        if (!restorable) {
          return Response.json(
            {
              message:
                "Riwayat ini tidak bisa dipulihkan (sumber tidak tersimpan).",
            },
            { status: 409 },
          );
        }

        try {
          const { newSnapshotId } = await restoreSnapshot(snapshotId);
          devLog("snapshots", "restore", {
            fromSnapshotId: snapshotId,
            newSnapshotId,
            projectId: project.id,
            userId: session.user.id,
          });
          return Response.json({ snapshotId: newSnapshotId }, { status: 201 });
        } catch (error) {
          devLog("snapshots", "restore.error", {
            error: error instanceof Error ? error.message : String(error),
            fromSnapshotId: snapshotId,
            projectId: project.id,
          });
          return Response.json(
            { message: "Gagal memulihkan riwayat." },
            { status: 500 },
          );
        }
      },
    },
  },
});
