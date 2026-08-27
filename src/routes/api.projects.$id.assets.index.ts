import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import {
  deleteProjectAssetById,
  listProjectAssetsWithUsage,
} from "@/lib/projects/project-assets";
import { verifyProjectOwnership } from "@/middleware/ownership";

export const Route = createFileRoute("/api/projects/$id/assets/")({
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

        const { id } = params;
        const isOwner = await verifyProjectOwnership(id, session.user.id);
        if (!isOwner) {
          return Response.json(
            { message: "Proyek tidak ditemukan." },
            { status: 404 },
          );
        }

        const result = await listProjectAssetsWithUsage(id);
        return Response.json(result);
      },

      DELETE: async ({ request, params }) => {
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

        const url = new URL(request.url);
        const queryAssetId = url.searchParams.get("assetId");
        let assetId = queryAssetId;

        if (!assetId) {
          const body = await request.json().catch(() => null);
          assetId =
            typeof body === "object" && body && "assetId" in body
              ? String((body as { assetId: unknown }).assetId)
              : null;
        }

        if (!assetId) {
          return Response.json(
            { message: "Parameter assetId wajib diisi." },
            { status: 400 },
          );
        }

        const deleted = await deleteProjectAssetById({
          assetId,
          projectId: id,
          userId: session.user.id,
        });

        if (!deleted) {
          return Response.json(
            { message: "Aset tidak ditemukan." },
            { status: 404 },
          );
        }

        return Response.json({ ok: true });
      },
    },
  },
});
