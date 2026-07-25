import { createFileRoute } from "@tanstack/react-router";

import { prisma } from "@/lib/prisma";

type AssetRow = { id: string; publicUrl: string | null } | null;

export function resolveMediaRedirect(
  asset: AssetRow,
): { location: string; status: 302 } | { status: 404 } {
  if (!asset || !asset.publicUrl) {
    return { status: 404 };
  }
  return { location: asset.publicUrl, status: 302 };
}

export const Route = createFileRoute("/media/$assetId")({
  server: {
    handlers: {
      // Public media serve: owner-uploaded display media embedded in
      // published/generated sites. No auth — the assetId (cuid) is the gate;
      // the image is meant to be public (it appears on a live site).
      GET: async ({ params }) => {
        const asset = await prisma.projectAsset.findUnique({
          select: { id: true, publicUrl: true },
          where: { id: params.assetId },
        });
        const resolved = resolveMediaRedirect(asset);
        if (resolved.status === 404) {
          return new Response(null, { status: 404 });
        }
        return new Response(null, {
          headers: {
            "Cache-Control": "public, max-age=31536000, immutable",
            Location: resolved.location,
          },
          status: 302,
        });
      },
    },
  },
});
