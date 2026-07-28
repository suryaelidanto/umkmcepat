import { randomUUID } from "node:crypto";

import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { putStoredObject } from "@/lib/object-storage";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export const Route = createFileRoute("/api/support/assets")({
  server: {
    handlers: {
      // POST /api/support/assets: Upload support ticket attachments (both user and admin).
      // Multipart form field: `file`
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

        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
          return Response.json(
            {
              message:
                "Format file tidak didukung. Gunakan PNG, JPEG, WEBP, atau GIF.",
            },
            { status: 400 },
          );
        }

        const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
        const assetId = randomUUID();
        const key = `support/assets/${assetId}.${ext}`;
        const bytes = Buffer.from(await file.arrayBuffer());

        try {
          const ref = await putStoredObject({
            body: bytes,
            contentType: file.type,
            key,
          });

          return Response.json(
            {
              assetId,
              ref,
              url: `/api/support/assets/${assetId}`,
            },
            { status: 201 },
          );
        } catch (error) {
          console.error("[support-upload] S3 write error:", error);
          return Response.json(
            { message: "Gagal menyimpan file ke storage." },
            { status: 500 },
          );
        }
      },
    },
  },
});
