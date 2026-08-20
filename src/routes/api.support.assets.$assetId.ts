import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import { getStoredObject } from "@/lib/storage/object-storage";
import { isAdminEmail } from "@/lib/waitlist/waitlist";

export const Route = createFileRoute("/api/support/assets/$assetId")({
  server: {
    handlers: {
      // GET /api/support/assets/$assetId: Retrieve and stream a support ticket image attachment.
      GET: async ({ params }) => {
        const session = await auth();
        if (!session?.user?.id || !session.user.email) {
          return new Response("Unauthorized", { status: 401 });
        }

        const isAdmin = isAdminEmail(session.user.email);
        const { assetId } = params;

        if (!isAdmin) {
          const asset = await prisma.supportAsset.findUnique({
            where: { assetId },
            select: {
              ticket: {
                select: { userId: true },
              },
            },
          });

          if (!asset?.ticket || asset.ticket.userId !== session.user.id) {
            return new Response("Forbidden", { status: 403 });
          }
        }

        // Fetch from S3
        const key = `support/assets/${assetId}`;
        const ref = `object:s3:${key}`;
        const stored = await getStoredObject(ref);

        if (!stored) {
          return new Response("Not Found", { status: 404 });
        }

        return new Response(new Uint8Array(stored.body), {
          headers: {
            "Cache-Control": "private, max-age=31536000, immutable",
            "Content-Type": stored.contentType,
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
