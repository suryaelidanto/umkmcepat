import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import {
  isProjectDeploymentForProject,
  selectActivePreviewDeployment,
} from "@/lib/projects/deployment-resolution";
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

        const deployments = await prisma.projectDeployment.findMany({
          where: { kind: "preview", projectId: id },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            build: {
              select: {
                artifactRef: true,
                createdAt: true,
                id: true,
                projectId: true,
                snapshot: { select: { id: true, projectId: true } },
                snapshotId: true,
                status: true,
                updatedAt: true,
              },
            },
            buildId: true,
            createdAt: true,
            id: true,
            kind: true,
            projectId: true,
            snapshot: { select: { id: true, projectId: true } },
            snapshotId: true,
            status: true,
            updatedAt: true,
          },
        });
        const deployment = selectActivePreviewDeployment(
          deployments.filter((candidate) =>
            isProjectDeploymentForProject(candidate, id),
          ),
        );

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
