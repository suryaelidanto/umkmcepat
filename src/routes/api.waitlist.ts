import { randomUUID } from "node:crypto";

import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { devLog } from "@/lib/dev-log";
import { putStoredObject } from "@/lib/object-storage";
import { checkRateLimit } from "@/lib/rate-limit";
import { mapToUserFacingError } from "@/lib/user-facing-error";
import { buildWaitlistStory, submitWaitlist } from "@/lib/waitlist";

const MAX_WAITLIST_IMAGE_BYTES = 5 * 1024 * 1024;

export const Route = createFileRoute("/api/waitlist")({
  server: {
    handlers: {
      // Submit a pilot waitlist entry. Multipart form fields: businessName,
      // businessType, phone, storyAnswers (offers/since/goal combined into the
      // single story string), turnstile token, email (attached to user session
      // on the client), and an optional `file` image.
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

        const storyBuilt = buildWaitlistStory({
          goal: String(form.get("storyGoal") ?? ""),
          offers: String(form.get("storyOffers") ?? ""),
          since: String(form.get("storySince") ?? ""),
        });
        if (!storyBuilt.ok) {
          return Response.json({ message: storyBuilt.reason }, { status: 400 });
        }

        const session = await auth();
        if (!session?.user?.email) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        let imageRef: string | null = null;
        const files = form
          .getAll("file")
          .filter((v): v is File => v instanceof File);
        if (files.length > 0) {
          const refs: string[] = [];
          for (const file of files) {
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
              if (!isImageMagicBytes(bytes)) {
                return Response.json(
                  { message: "File bukan gambar (PNG/JPEG/WEBP)." },
                  { status: 400 },
                );
              }
              const ref = await putStoredObject({
                body: bytes,
                contentType: file.type || "image/png",
                key: `waitlist/${randomUUID().replace(/-/g, "")}.png`,
              });
              refs.push(ref);
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
          imageRef = JSON.stringify(refs);
        }

        try {
          const entry = await submitWaitlist({
            businessName: String(form.get("businessName") ?? ""),
            businessType: String(form.get("businessType") ?? "") || null,
            email: session.user.email,
            imageRef,
            phone: String(form.get("phone") ?? "") || null,
            story: storyBuilt.story,
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
