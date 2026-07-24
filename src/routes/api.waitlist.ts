import { randomUUID } from "node:crypto";

import { createFileRoute } from "@tanstack/react-router";

import { devLog } from "@/lib/dev-log";
import { putStoredObject } from "@/lib/object-storage";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
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
          const message =
            error instanceof Error
              ? error.message
              : "Gagal mengirim pendaftaran.";
          return Response.json({ message }, { status: 400 });
        }
      },
    },
  },
});
