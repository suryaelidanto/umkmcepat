import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isAllowedAssetPurpose,
  uploadProjectAsset,
} from "@/lib/projects/project-asset-upload";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const Route = createFileRoute("/api/projects/$id/assets")({
  server: {
    handlers: {
      // Upload one owner-scoped project asset (business image / reference / logo).
      // Multipart form: field `file` (required), `purpose` (required, allowlisted).
      POST: async ({ request, params }) => {
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

        const form = await request.formData().catch(() => null);
        if (!form) {
          return Response.json(
            { message: "Permintaan upload tidak valid." },
            { status: 400 },
          );
        }

        const purpose = String(form.get("purpose") ?? "").trim();
        if (!isAllowedAssetPurpose(purpose)) {
          return Response.json(
            {
              message: `Tujuan aset tidak valid. Gunakan salah satu: business-image, logo, reference.`,
            },
            { status: 400 },
          );
        }

        const file = form.get("file");
        if (!(file instanceof File)) {
          return Response.json(
            { message: "File belum dipilih." },
            { status: 400 },
          );
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          return Response.json(
            { message: `Ukuran file melebihi ${MAX_UPLOAD_BYTES} byte.` },
            { status: 413 },
          );
        }

        const bytes = Buffer.from(await file.arrayBuffer());
        try {
          const asset = await uploadProjectAsset({
            bytes,
            projectId: project.id,
            purpose,
            userId: session.user.id,
          });
          return Response.json(asset, { status: 201 });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Upload gagal.";
          return Response.json({ message }, { status: 400 });
        }
      },
    },
  },
});
