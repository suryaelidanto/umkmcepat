import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import { isProjectBuildForProject } from "@/lib/projects/deployment-resolution";
import {
  captureProjectThumbnail,
  readProjectThumbnail,
  writeProjectThumbnail,
} from "@/lib/projects/project-thumbnail";
import { isProjectArtifactRefFor } from "@/lib/projects/runtime-artifacts";
import { isAdminEmail } from "@/lib/waitlist/waitlist";

export const Route = createFileRoute(
  "/api/projects/$id/snapshots/$snapshotId/thumbnail",
)({
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

        const { id, snapshotId } = params;
        const project = await prisma.project.findFirst({
          where: {
            id,
            ...(isAdminEmail(session.user.email ?? "")
              ? {}
              : { userId: session.user.id }),
          },
          select: { id: true },
        });
        if (!project) {
          return Response.json(
            { message: "Proyek tidak ditemukan." },
            { status: 404 },
          );
        }

        const snapshot = await prisma.projectSnapshot.findFirst({
          where: { id: snapshotId, projectId: id },
          select: { id: true },
        });
        if (!snapshot) {
          return Response.json(
            { message: "Thumbnail tidak tersedia untuk versi ini." },
            { status: 404 },
          );
        }

        const buildWhere = {
          artifactRef: { not: null },
          project: { id },
          projectId: id,
          snapshot: { projectId: id },
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
          (!isProjectBuildForProject(build, id) ||
            !isProjectArtifactRefFor(build.artifactRef, "dist", build.id))
        ) {
          build = null;
        }

        if (!build?.artifactRef) {
          return Response.json(
            { message: "Thumbnail tidak tersedia untuk versi ini." },
            { status: 404 },
          );
        }

        // Try reading existing cached thumbnail for this build, or capture on-demand
        const expectedThumbnailRef = `project-thumbnail:s3-private:${id}-${snapshotId}`;
        try {
          const cached = await readProjectThumbnail(expectedThumbnailRef);
          return new Response(cached, {
            headers: {
              "Cache-Control": "private, max-age=31536000, immutable",
              "Content-Type": "image/jpeg",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch {
          // Cache miss: generate thumbnail on-demand from build artifact
          try {
            const bytes = await captureProjectThumbnail(build.artifactRef);
            await writeProjectThumbnail({
              bytes,
              projectId: `${id}-${snapshotId}`,
            }).catch(() => undefined);

            return new Response(new Uint8Array(bytes), {
              headers: {
                "Cache-Control": "private, max-age=31536000, immutable",
                "Content-Type": "image/jpeg",
                "X-Content-Type-Options": "nosniff",
              },
            });
          } catch {
            return Response.json(
              { message: "Gagal membuat thumbnail." },
              { status: 500 },
            );
          }
        }
      },
    },
  },
});
