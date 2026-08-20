import { randomUUID } from "node:crypto";

import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import {
  contentTypeFromExt,
  detectImageFormat,
} from "@/lib/storage/images/format";
import { putStoredObject } from "@/lib/storage/object-storage";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const Route = createFileRoute("/api/support/assets")({
  server: {
    handlers: {
      // POST /api/support/assets: Upload support ticket attachments (both user and admin).
      POST: async ({ request }) => {
        const session = await auth();
        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const form = await request.formData().catch(() => null);
        if (!form) {
          return Response.json(
            { message: "Permintaan upload tidak valid." },
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
            { message: `Ukuran file melebihi 5 MB.` },
            { status: 413 },
          );
        }

        const bytes = Buffer.from(await file.arrayBuffer());
        const format = detectImageFormat(bytes);
        if (!format) {
          return Response.json(
            {
              message:
                "Format file tidak didukung. Gunakan PNG, JPEG, WEBP, atau GIF.",
            },
            { status: 400 },
          );
        }

        const assetId = `${randomUUID()}.${format}`;
        const key = `support/assets/${assetId}`;
        const contentType = contentTypeFromExt(format);

        try {
          const ref = await putStoredObject({
            body: bytes,
            contentType,
            key,
          });

          await prisma.supportAsset.create({
            data: {
              assetId,
              uploadedById: session.user.id,
            },
          });

          return Response.json(
            {
              assetId,
              contentType,
              ref,
              url: `/api/support/assets/${assetId}`,
            },
            { status: 201 },
          );
        } catch (error) {
          console.error("[support-upload] S3 write error", {
            assetId,
            error: error instanceof Error ? error.message : error,
          });
          return Response.json(
            { message: "Gagal menyimpan file ke storage." },
            { status: 500 },
          );
        }
      },
    },
  },
});
