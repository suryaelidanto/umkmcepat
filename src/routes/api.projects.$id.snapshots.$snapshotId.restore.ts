import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import { isProjectBuildForProject } from "@/lib/projects/deployment-resolution";
import { isProjectArtifactRefFor } from "@/lib/projects/runtime-artifacts";

export const Route = createFileRoute(
  "/api/projects/$id/snapshots/$snapshotId/restore",
)({
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
          },
        });
        if (!snapshot) {
          return Response.json(
            { message: "Riwayat tidak ditemukan." },
            { status: 404 },
          );
        }

        // Only restorable snapshots (files or sourceRef present) can checkout.
        const restorable =
          (Array.isArray(snapshot.files) && snapshot.files.length > 0) ||
          isProjectArtifactRefFor(snapshot.sourceRef, "source", snapshot.id);
        if (!restorable) {
          return Response.json(
            {
              message:
                "Riwayat ini tidak bisa dipulihkan (sumber tidak tersimpan).",
            },
            { status: 409 },
          );
        }

        const buildWhere = {
          artifactRef: { not: null },
          project: { id: project.id },
          projectId: project.id,
          snapshot: { projectId: project.id },
          status: "succeeded",
        } as const;
        let build = await prisma.projectBuild.findFirst({
          where: { ...buildWhere, snapshotId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            artifactRef: true,
            id: true,
            projectId: true,
            snapshot: { select: { id: true, projectId: true } },
            snapshotId: true,
          },
        });
        if (
          build &&
          (!isProjectBuildForProject(build, project.id) ||
            !isProjectArtifactRefFor(build.artifactRef, "dist", build.id))
        ) {
          build = null;
        }

        if (!build) {
          return Response.json(
            { message: "Versi ini belum berhasil dibuat untuk Preview." },
            { status: 409 },
          );
        }

        try {
          const files =
            Array.isArray(snapshot.files) && snapshot.files.length > 0
              ? snapshot.files
              : undefined;

          const meta =
            snapshot.metadata && typeof snapshot.metadata === "object"
              ? (snapshot.metadata as Record<string, unknown>)
              : {};
          const handoffId =
            typeof meta.handoffId === "string" ? meta.handoffId : undefined;
          if (handoffId) {
            const handoff = await prisma.projectBuildHandoff.findFirst({
              where: {
                id: handoffId,
                projectId: project.id,
                status: { in: ["accepted", "superseded"] },
                userId: session.user.id,
              },
              select: { id: true },
            });
            if (!handoff) {
              return Response.json(
                { message: "Riwayat ini tidak valid." },
                { status: 409 },
              );
            }
          }

          await prisma.$transaction(async (tx) => {
            await tx.projectDeployment.create({
              data: {
                buildId: build.id,
                kind: "preview",
                projectId: project.id,
                publicPath: `/api/projects/${project.id}/preview`,
                snapshotId: build.snapshotId,
                status: "created",
              },
              select: { id: true },
            });

            await tx.project.update({
              where: { id: project.id },
              data: {
                ...(files ? { sourceFiles: files } : {}),
                ...(handoffId ? { activeHandoffId: handoffId } : {}),
                buildStatus: "passed",
                status: "ready",
              },
            });
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
