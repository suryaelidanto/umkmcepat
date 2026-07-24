import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import {
  type ProjectAssetKind,
  readProjectAsset,
  writeProjectAsset,
} from "@/lib/projects/project-assets";

const PURPOSE_TO_KIND: Record<string, ProjectAssetKind> = {
  "business-image": "business-image",
  logo: "logo",
  reference: "reference",
};

const ALLOWED_PURPOSES = Object.keys(PURPOSE_TO_KIND);

const EXT_CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Derive the authoritative content type from the byte-detected extension in
 * the ref, NOT from the client-supplied file.type (which can lie). The ref's
 * extension is set by writeProjectAsset from magic-byte detection.
 */
export function contentTypeFromRef(ref: string): string {
  const ext = ref.slice(ref.lastIndexOf(".") + 1).toLowerCase();
  return EXT_CONTENT_TYPE[ext] ?? "application/octet-stream";
}

export type UploadedProjectAsset = {
  id: string;
  ref: string;
  url: string;
  contentType: string;
  sizeBytes: number;
};

export function isAllowedAssetPurpose(purpose: string): purpose is string {
  return ALLOWED_PURPOSES.includes(purpose);
}

/**
 * Validate, store, and record an owner-scoped project asset upload. The bytes
 * are magic-byte validated + size-capped inside writeProjectAsset; this layer
 * resolves the kind from the caller-supplied `purpose`, persists a ProjectAsset
 * row for cleanup-on-delete, and returns a signed-ish URL path the workspace
 * can use to fetch the asset behind auth.
 */
export async function uploadProjectAsset({
  bytes,
  projectId,
  purpose,
  userId,
}: {
  bytes: Buffer;
  projectId: string;
  purpose: string;
  userId: string;
}): Promise<UploadedProjectAsset> {
  const kind = PURPOSE_TO_KIND[purpose];
  if (!kind) {
    throw new Error(
      `Invalid asset purpose '${purpose}'. Allowed: ${ALLOWED_PURPOSES.join(", ")}.`,
    );
  }

  const ref = await writeProjectAsset({
    bytes,
    kind,
    projectId,
    userId,
  });

  // Derive the content type from the byte-detected extension in the ref, not
  // from the client-supplied contentType (which can lie about the bytes).
  const storedContentType = contentTypeFromRef(ref);

  const asset = await prisma.projectAsset.create({
    data: {
      contentType: storedContentType,
      projectId,
      purpose,
      ref,
      sizeBytes: bytes.length,
      userId,
    },
    select: { id: true, ref: true },
  });

  devLog("project-asset", "upload", {
    assetId: asset.id,
    bytes: bytes.length,
    kind,
    projectId,
    purpose,
    userId,
  });

  return {
    contentType: storedContentType,
    id: asset.id,
    ref: asset.ref,
    sizeBytes: bytes.length,
    url: `/api/projects/${projectId}/assets/${asset.id}`,
  };
}

export async function readProjectAssetById(assetId: string) {
  const asset = await prisma.projectAsset.findUnique({
    where: { id: assetId },
    select: { ref: true, projectId: true, userId: true },
  });
  if (!asset) {
    return null;
  }
  const stored = await readProjectAsset(asset.ref);
  return {
    ...stored,
    projectId: asset.projectId,
    userId: asset.userId,
  };
}
