import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth-admin";
import { getStoredObject } from "@/lib/object-storage";
import { prisma } from "@/lib/prisma";

export const Route = createFileRoute(
  "/api/admin/waitlist/image/$entryId/$index",
)({
  server: {
    handlers: {
      // Admin-only: stream a waitlist entry's evidence image from storage.
      // Private bucket reads are server-proxied; the browser never sees the R2 URL.
      // imageRef is stored as a JSON array of refs (1-3 uploaded photos);
      // $index selects which one to serve.
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
        let refs: unknown;
        try {
          refs = JSON.parse(entry.imageRef);
        } catch {
          return new Response(null, { status: 404 });
        }
        if (!Array.isArray(refs) || typeof params.index !== "string") {
          return new Response(null, { status: 404 });
        }
        const idx = Number.parseInt(params.index, 10);
        if (!Number.isInteger(idx) || idx < 0 || idx >= refs.length) {
          return new Response(null, { status: 404 });
        }
        const ref = refs[idx];
        if (typeof ref !== "string") {
          return new Response(null, { status: 404 });
        }
        const stored = await getStoredObject(ref);
        if (!stored) {
          return new Response(null, { status: 404 });
        }
        return new Response(new Uint8Array(stored.body), {
          headers: {
            "Cache-Control": "no-cache",
            "Content-Type": stored.contentType,
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
