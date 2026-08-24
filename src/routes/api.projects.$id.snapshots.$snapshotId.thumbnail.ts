import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import {
  captureProjectThumbnail,
  readProjectThumbnail,
  writeProjectThumbnail,
} from "@/lib/projects/project-thumbnail";
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
          select: { id: true, parentSnapshotId: true },
        });

        const build = await prisma.projectBuild.findFirst({
          where: {
            projectId: id,
            status: "succeeded",
            artifactRef: { not: null },
            OR: [
              { snapshotId },
              ...(snapshot?.parentSnapshotId
                ? [{ snapshotId: snapshot.parentSnapshotId }]
                : []),
            ],
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, artifactRef: true },
        });

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
