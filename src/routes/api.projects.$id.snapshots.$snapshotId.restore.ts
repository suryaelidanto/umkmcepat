import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import { isSnapshotRestorableAgainstActiveHandoff } from "@/lib/projects/build-handoffs";

export const Route = createFileRoute(
  "/api/projects/$id/snapshots/$snapshotId/restore",
)({
  server: {
    handlers: {
      // Restore a snapshot by branching from it (append-only). The target and
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
          select: { id: true, generationEngine: true },
        });
        if (!project) {
          return Response.json(
            { message: "Proyek tidak ditemukan." },
            { status: 404 },
          );
        }

        const snapshot = await prisma.projectSnapshot.findFirst({
          where: { id: snapshotId, projectId: project.id },
          select: {
            id: true,
            files: true,
            sourceRef: true,
            metadata: true,
            parentSnapshotId: true,
          },
        });
        if (!snapshot) {
          return Response.json(
            { message: "Riwayat tidak ditemukan." },
            { status: 404 },
          );
        }

        // contract: a snapshot may only be restored directly when its
        if (
          project.generationEngine === "contract" ||
          project.generationEngine === "contract-v1"
        ) {
          const restorableAgainstActive =
            await isSnapshotRestorableAgainstActiveHandoff({
              projectId: project.id,
              snapshotMetadata: snapshot.metadata,
            });
          if (!restorableAgainstActive) {
            return Response.json(
              {
                message:
                  "Riwayat ini perlu persetujuan rencana baru untuk dipulihkan.",
              },
              { status: 409 },
            );
          }
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

        const build = await prisma.projectBuild.findFirst({
          where: {
            artifactRef: { not: null },
            status: "succeeded",
            OR: [
              { snapshotId },
              ...(snapshot.parentSnapshotId
                ? [{ snapshotId: snapshot.parentSnapshotId }]
                : []),
            ],
          },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (!build) {
          return Response.json(
            { message: "Versi ini belum berhasil dibuat untuk Preview." },
            { status: 409 },
          );
        }

        try {
          // Checkout snapshot directly: activate for preview and sync workspace source
          const files =
            Array.isArray(snapshot.files) && snapshot.files.length > 0
              ? snapshot.files
              : undefined;

          await prisma.$transaction(async (tx) => {
            await tx.projectDeployment.create({
              data: {
                buildId: build.id,
                kind: "preview",
                projectId: project.id,
                publicPath: `/api/projects/${project.id}/preview`,
                snapshotId,
                status: "created",
              },
              select: { id: true },
            });

            if (files) {
              await tx.project.update({
                where: { id: project.id },
                data: {
                  sourceFiles: files,
                  buildStatus: "passed",
                },
              });
            }
          });

          devLog("snapshots", "checkout", {
            buildId: build.id,
            snapshotId,
            projectId: project.id,
            userId: session.user.id,
          });
          return Response.json({ snapshotId }, { status: 200 });
        } catch (error) {
          devLog("snapshots", "restore.error", {
            error: error instanceof Error ? error.message : String(error),
            fromSnapshotId: snapshotId,
            projectId: project.id,
          });
          return Response.json(
            { message: "Gagal memilih versi ini." },
            { status: 500 },
          );
        }
      },
    },
  },
});
