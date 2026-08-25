import { createFileRoute } from "@tanstack/react-router";

import { moderateProjectRequest } from "@/lib/ai/ai-moderation";
import { auth } from "@/lib/auth/auth";
import { getSetting } from "@/lib/config/app-settings";
import {
  isAllowedAssetPurpose,
  uploadProjectAsset,
} from "@/lib/projects/project-asset-upload";
import {
  contentTypeFromExt,
  detectImageFormat,
} from "@/lib/storage/images/format";
import { claimTempImage } from "@/lib/storage/uploads/temp-image-storage";
import { mapToUserFacingError } from "@/lib/user-facing-error";
import { verifyProjectOwnership } from "@/middleware/ownership";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const Route = createFileRoute("/api/projects/$id/assets/upload")({
  server: {
    handlers: {
      // Upload one owner-scoped project asset (business image / reference / logo).
      POST: async ({ request, params }) => {
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

        if (!(await getSetting("feature.composer_uploads_enabled", true))) {
          return new Response("Not Found", { status: 404 });
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

        const rawAssetId = String(form.get("assetId") ?? "").trim();
        const file = form.get("file");

        // Pre-uploaded temp assetId: claim, moderate, persist as project asset.
        if (rawAssetId) {
          try {
            const claimed = await claimTempImage(session.user.id, rawAssetId);
            try {
              const moderation = await moderateProjectRequest(
                "",
                [{ bytes: claimed.body, mediaType: claimed.contentType }],
                undefined,
                { projectId: id },
              );
              if (!moderation.allowed) {
                return Response.json(
                  {
                    message:
                      "message" in moderation
                        ? moderation.message
                        : "Gambar tidak memenuhi syarat.",
                  },
                  { status: 400 },
                );
              }
            } catch (modError) {
              console.warn(
                "[moderation] image moderation check bypassed due to model error",
                modError,
              );
            }
            const asset = await uploadProjectAsset({
              bytes: claimed.body,
              projectId: id,
              purpose,
              userId: session.user.id,
            });
            return Response.json(asset, { status: 201 });
          } catch (error) {
            console.error("[moderation] assets.upload claim failed", {
              error: error instanceof Error ? error.message : error,
            });
            const message = mapToUserFacingError(
              error instanceof Error ? error.message : "",
            );
            return Response.json({ message }, { status: 503 });
          }
        }

        // Legacy file upload
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
        const detectedFormat = detectImageFormat(bytes);
        if (!detectedFormat) {
          return Response.json(
            {
              message:
                "Format gambar tidak didukung. Gunakan PNG, JPEG, atau WEBP.",
            },
            { status: 400 },
          );
        }
        const contentType = contentTypeFromExt(detectedFormat);

        try {
          try {
            const moderation = await moderateProjectRequest(
              "",
              [{ bytes, mediaType: contentType }],
              undefined,
              { projectId: id },
            );
            if (!moderation.allowed) {
              return Response.json(
                {
                  message:
                    "message" in moderation
                      ? moderation.message
                      : "Gambar tidak memenuhi syarat.",
                },
                { status: 400 },
              );
            }
          } catch (modError) {
            console.warn(
              "[moderation] direct file image moderation check bypassed due to model error",
              modError,
            );
          }
          const asset = await uploadProjectAsset({
            bytes,
            projectId: id,
            purpose,
            userId: session.user.id,
          });
          return Response.json(asset, { status: 201 });
        } catch (error) {
          console.error("[moderation] assets.upload failed", {
            error: error instanceof Error ? error.message : error,
          });
          const message = mapToUserFacingError(
            error instanceof Error ? error.message : "",
          );
          return Response.json({ message }, { status: 503 });
        }
      },
    },
  },
});
