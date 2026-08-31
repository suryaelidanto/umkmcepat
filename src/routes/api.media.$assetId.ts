import { createFileRoute } from "@tanstack/react-router";

import { prisma } from "@/lib/prisma";
import {
  parseProjectAssetRef,
  readProjectAsset,
} from "@/lib/projects/project-assets";

type AssetRow = {
  id: string;
  purpose: string;
  publicUrl: string | null;
  projectId?: string;
  ref?: string;
  contentType?: string;
  userId?: string;
} | null;

export function resolveMediaRedirect(
  asset: AssetRow,
):
  | { location: string; status: 302 }
  | { stream: boolean; status: 200 }
  | { status: 404 } {
  if (
    !asset ||
    !asset.publicUrl ||
    (asset.purpose !== "business-image" && asset.purpose !== "logo") ||
    !asset.ref ||
    asset.ref.startsWith("project-asset:s3-private:")
  ) {
    return { status: 404 };
  }

  const parsedRef = parseProjectAssetRef(asset.ref);
  if (
    !parsedRef ||
    parsedRef.kind !== asset.purpose ||
    (asset.projectId !== undefined &&
      parsedRef.projectId !== asset.projectId) ||
    (asset.userId !== undefined && parsedRef.userId !== asset.userId)
  ) {
    return { status: 404 };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  let isSameOrigin = false;
  try {
    if (asset.publicUrl) {
      const parsed = new URL(asset.publicUrl);
      const appParsed = new URL(appUrl);
      isSameOrigin = parsed.host === appParsed.host;
    }
  } catch {
    isSameOrigin = true;
  }
  if (
    asset.publicUrl &&
    asset.publicUrl.startsWith("https://") &&
    !asset.publicUrl.includes("localhost") &&
    !isSameOrigin
  ) {
    return { location: asset.publicUrl, status: 302 };
  }
  return { stream: true, status: 200 };
}

export async function serveMediaAsset(assetId: string): Promise<Response> {
  if (!assetId) {
    return new Response(null, { status: 404 });
  }
  const asset = await prisma.projectAsset.findUnique({
    select: {
      contentType: true,
      id: true,
      publicUrl: true,
      projectId: true,
      purpose: true,
      ref: true,
      userId: true,
    },
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

  return new Response(null, { status: 404 });
}

export const Route = createFileRoute("/api/media/$assetId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        return serveMediaAsset(params.assetId);
      },
    },
  },
});
