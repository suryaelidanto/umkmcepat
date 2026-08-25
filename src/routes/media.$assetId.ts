import { createFileRoute } from "@tanstack/react-router";

import { prisma } from "@/lib/prisma";
import { readProjectAsset } from "@/lib/projects/project-assets";

type AssetRow = {
  id: string;
  publicUrl: string | null;
  ref?: string;
  contentType?: string;
} | null;

export function resolveMediaRedirect(
  asset: AssetRow,
):
  | { location: string; status: 302 }
  | { stream: boolean; status: 200 }
  | { status: 404 } {
  if (!asset) {
    return { status: 404 };
  }
  // If publicUrl is a real public HTTPS CDN (e.g. Cloudflare R2 / S3), redirect directly
  if (
    asset.publicUrl &&
    asset.publicUrl.startsWith("https://") &&
    !asset.publicUrl.includes("localhost")
  ) {
    return { location: asset.publicUrl, status: 302 };
  }
  return { stream: true, status: 200 };
}

export const Route = createFileRoute("/media/$assetId")({
  server: {
    handlers: {
      // Public media serve: owner-uploaded display media embedded in generated sites
      GET: async ({ params }) => {
        const asset = await prisma.projectAsset.findUnique({
          select: { id: true, publicUrl: true, ref: true, contentType: true },
          where: { id: params.assetId },
        });
        const resolved = resolveMediaRedirect(asset);
        if (resolved.status === 404 || !asset) {
          return new Response(null, { status: 404 });
        }
        if ("location" in resolved) {
          return new Response(null, {
            headers: {
              "Cache-Control": "public, max-age=31536000, immutable",
              Location: resolved.location,
            },
            status: 302,
          });
        }
        try {
          const { body, contentType } = await readProjectAsset(asset.ref);
          return new Response(new Uint8Array(body), {
            headers: {
              "Cache-Control": "public, max-age=31536000, immutable",
              "Content-Type": contentType || asset.contentType || "image/png",
              "Content-Length": String(body.length),
            },
            status: 200,
          });
        } catch {
          return new Response(null, { status: 404 });
        }
      },
    },
  },
});
