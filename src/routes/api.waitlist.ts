import { randomUUID } from "node:crypto";

import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import { devLog } from "@/lib/dev-log";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  contentTypeFromExt,
  detectImageFormat,
} from "@/lib/storage/images/format";
import { putStoredObject } from "@/lib/storage/object-storage";
import { claimTempImage } from "@/lib/storage/uploads/temp-image-storage";
import { mapToUserFacingError } from "@/lib/user-facing-error";
import { buildWaitlistStory, submitWaitlist } from "@/lib/waitlist/waitlist";

const MAX_WAITLIST_IMAGE_BYTES = 5 * 1024 * 1024;

export const Route = createFileRoute("/api/waitlist")({
  server: {
    handlers: {
      // Submit a pilot waitlist entry. Multipart form fields: businessName,
      // businessType, storyAnswers (offers/since/goal combined into the
      // single story string), turnstile token, email (attached to user session
      // on the client), and photo asset ids.
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
        if (!session?.user?.id || !session?.user?.email) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        let imageRef: string | null = null;
        const tempAssetIds = form
          .getAll("assetIds")
          .filter((value): value is string => typeof value === "string");

        if (tempAssetIds.length > 0) {
          const refs: string[] = [];
          for (const tempAssetId of tempAssetIds) {
            try {
              const claimed = await claimTempImage(
                session.user.id,
                tempAssetId,
              );
              const format =
                claimed.contentType === "image/png"
                  ? "png"
                  : claimed.contentType === "image/webp"
                    ? "webp"
                    : "jpg";
              const ref = await putStoredObject({
                body: claimed.body,
                contentType: claimed.contentType,
                key: `waitlist/${randomUUID().replace(/-/g, "")}.${format}`,
              });
              refs.push(ref);
            } catch (error) {
              devLog("waitlist", "image.claim.error", {
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

        // Legacy file upload for backward compat
        const files = form
          .getAll("file")
          .filter((v): v is File => v instanceof File);
        if (!imageRef && files.length > 0) {
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
              const format = detectImageFormat(bytes);
              // GIF and unknown formats are rejected; only PNG/JPEG/WEBP are
              // accepted. Magic-byte check ignores the client-supplied
              // file.type, which can be spoofed.
              if (!format || format === "gif") {
                return Response.json(
                  { message: "File bukan gambar (PNG/JPEG/WEBP)." },
                  { status: 400 },
                );
              }
              const ref = await putStoredObject({
                body: bytes,
                contentType: contentTypeFromExt(format),
                key: `waitlist/${randomUUID().replace(/-/g, "")}.${format}`,
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
