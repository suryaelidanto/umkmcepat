import { randomUUID } from "node:crypto";

import { createFileRoute } from "@tanstack/react-router";

import { devLog } from "@/lib/dev-log";
import { putStoredObject } from "@/lib/object-storage";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { mapToUserFacingError } from "@/lib/user-facing-error";
import { submitWaitlist } from "@/lib/waitlist";

const MAX_WAITLIST_IMAGE_BYTES = 5 * 1024 * 1024;

export const Route = createFileRoute("/api/waitlist")({
  server: {
    handlers: {
      // Submit a pilot waitlist entry. Multipart form fields: email, phone,
      // businessName, businessType, story (required, min length), turnstile
      // token, and an optional `file` image (evidence for approval confidence).
      POST: async ({ request }) => {
        const rateLimitResponse = await checkRateLimit(request, "global");
        if (rateLimitResponse) {
          return rateLimitResponse;
        }

        const form = await request.formData().catch(() => null);
        if (!form) {
          return Response.json(
            { message: "Permintaan tidak valid." },
            { status: 400 },
          );
        }

        const token = String(form.get("cf-turnstile-response") ?? "");
        const turnstileOk = await verifyTurnstileToken(token);
        if (!turnstileOk) {
          return Response.json(
            { message: "Verifikasi keamanan gagal." },
            { status: 400 },
          );
        }

        let imageRef: string | null = null;
        const file = form.get("file");
        if (file instanceof File) {
          if (file.size > MAX_WAITLIST_IMAGE_BYTES) {
            return Response.json(
              {
                message: `Ukuran gambar melebihi ${MAX_WAITLIST_IMAGE_BYTES} byte.`,
              },
              { status: 413 },
            );
          }
          try {
            const bytes = Buffer.from(await file.arrayBuffer());
            // Magic-byte validation: don't trust file.type (can lie). Reject
            // non-images even if the client claims image/png.
            if (!isImageMagicBytes(bytes)) {
              return Response.json(
                { message: "File bukan gambar (PNG/JPEG/WEBP)." },
                { status: 400 },
              );
            }
            // object-storage enforces image-only keys + path safety.
            imageRef = await putStoredObject({
              body: bytes,
              contentType: file.type || "image/png",
              key: `waitlist/${randomUUID().replace(/-/g, "")}.png`,
            });
          } catch (error) {
            devLog("waitlist", "image.error", {
              error: error instanceof Error ? error.message : String(error),
            });
            return Response.json(
              { message: "Gambar tidak valid." },
              { status: 400 },
            );
          }
        }

        try {
          const entry = await submitWaitlist({
            businessName: String(form.get("businessName") ?? ""),
            businessType: String(form.get("businessType") ?? "") || null,
            email: String(form.get("email") ?? ""),
            imageRef,
            phone: String(form.get("phone") ?? "") || null,
            story: String(form.get("story") ?? ""),
          });
          return Response.json(entry, { status: 201 });
        } catch (error) {
          const message = mapToUserFacingError(
            error instanceof Error ? error.message : "",
          );
          return Response.json({ message }, { status: 400 });
        }
      },
    },
  },
});

// PNG/JPEG/WEBP magic-byte check (defense vs file.type spoofing).
function isImageMagicBytes(bytes: Buffer): boolean {
  if (bytes.length < 12) {
    return false;
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return true;
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true;
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }
  return false;
}
