import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth-admin";
import { getStoredObject } from "@/lib/object-storage";
import { prisma } from "@/lib/prisma";

export const Route = createFileRoute("/api/admin/waitlist/image/$entryId")({
  server: {
    handlers: {
      // Admin-only: stream a waitlist entry's evidence image from storage.
      // Private bucket reads are server-proxied; the browser never sees the R2 URL.
      GET: async ({ params }) => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return new Response(null, { status: admin.status });
        }
        const entry = await prisma.waitlistEntry.findUnique({
          select: { imageRef: true },
          where: { id: params.entryId },
        });
        if (!entry?.imageRef) {
          return new Response(null, { status: 404 });
        }
        const stored = await getStoredObject(entry.imageRef);
        if (!stored) {
          return new Response(null, { status: 404 });
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
