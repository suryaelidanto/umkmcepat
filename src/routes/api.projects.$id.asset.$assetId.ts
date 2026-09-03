import { createFileRoute } from "@tanstack/react-router";

import { resolveMediaRedirect } from "./api.media.$assetId";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import { readProjectAssetById } from "@/lib/projects/project-asset-upload";

export const Route = createFileRoute("/api/projects/$id/asset/$assetId")({
  server: {
    handlers: {
      // Serve an owner-uploaded project asset behind auth + ownership. The
      GET: async ({ params }) => {
        const session = await auth();
        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const { id, assetId } = params;

        const asset = await prisma.projectAsset.findUnique({
          where: { id: assetId },
          select: {
            projectId: true,
            publicUrl: true,
            purpose: true,
            ref: true,
            userId: true,
            project: { select: { userId: true } },
          },
        });
        if (
          !asset ||
          asset.projectId !== id ||
          asset.userId !== session.user.id ||
          asset.project?.userId !== session.user.id
        ) {
          return Response.json(
            { message: "Aset tidak ditemukan." },
            { status: 404 },
          );
        }

        const media = resolveMediaRedirect({ id: assetId, ...asset });
        if ("location" in media) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: media.location,
              "Cache-Control": "private, max-age=31536000, immutable",
            },
          });
        }

        try {
          const stored = await readProjectAssetById(assetId, {
            projectId: id,
            userId: session.user.id,
          });
          if (!stored) {
            return Response.json(
              { message: "Aset tidak ditemukan." },
              { status: 404 },
            );
          }
          return new Response(new Uint8Array(stored.body), {
            headers: {
              "Cache-Control": "private, max-age=31536000, immutable",
              "Content-Type": stored.contentType,
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch {
          return Response.json(
            { message: "Aset tidak ditemukan." },
            { status: 404 },
          );
        }
      },
    },
  },
});
