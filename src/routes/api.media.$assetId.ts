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
  if (
    asset.publicUrl &&
    asset.publicUrl.startsWith("https://") &&
    !asset.publicUrl.includes("localhost")
  ) {
    return { location: asset.publicUrl, status: 302 };
  }
  return { stream: true, status: 200 };
}

export const Route = createFileRoute("/api/media/$assetId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { assetId } = params;
        if (!assetId) {
          return new Response(null, { status: 404 });
        }
        const asset = await prisma.projectAsset.findUnique({
          select: { id: true, publicUrl: true, ref: true, contentType: true },
          where: { id: assetId },
        });
        const resolved = resolveMediaRedirect(asset);
        if (asset && resolved.status !== 404) {
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
        }

        // Fallback: check if assetId is a temp-upload image token
        try {
          const jsonStr = Buffer.from(
            assetId.split(".")[0],
            "base64url",
          ).toString("utf-8");
          const parsed = JSON.parse(jsonStr) as {
            key?: string;
            contentType?: string;
          };
          if (parsed.key?.startsWith("temp-uploads/")) {
            const { getS3Object } = await import("@/lib/storage/s3-client");
            const body = await getS3Object("private", parsed.key);
            return new Response(new Uint8Array(body), {
              headers: {
                "Cache-Control": "public, max-age=3600",
                "Content-Type": parsed.contentType || "image/jpeg",
                "Content-Length": String(body.length),
                "X-Content-Type-Options": "nosniff",
              },
              status: 200,
            });
          }
        } catch {
          // ignore
        }

        return new Response(null, { status: 404 });
      },
    },
  },
});
