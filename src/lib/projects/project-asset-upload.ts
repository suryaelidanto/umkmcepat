import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import {
  type ProjectAssetKind,
  readProjectAsset,
  writeProjectAsset,
} from "@/lib/projects/project-assets";

export const MAX_PROJECT_ASSETS = 10;
export const MAX_PROJECT_ASSET_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_TURN_IMAGES = 6;

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

export function contentTypeFromRef(ref: string): string {
  const ext = ref.slice(ref.lastIndexOf(".") + 1).toLowerCase();
  return EXT_CONTENT_TYPE[ext] ?? "application/octet-stream";
}

export type UploadedProjectAsset = {
  id: string;
  ref: string;
  url: string;
  publicUrl: string | null;
  contentType: string;
  sizeBytes: number;
};

export function isAllowedAssetPurpose(purpose: string): purpose is string {
  return ALLOWED_PURPOSES.includes(purpose);
}

export function getProjectAssetUrl(projectId: string, assetId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/asset/${encodeURIComponent(assetId)}`;
}

export async function uploadProjectAsset({
  bytes,
  projectId,
  purpose,
  sourceTempAssetId,
  userId,
}: {
  bytes: Buffer;
  projectId: string;
  purpose: string;
  sourceTempAssetId?: string;
  userId: string;
}): Promise<UploadedProjectAsset> {
  const kind = PURPOSE_TO_KIND[purpose];
  if (!kind) {
    throw new Error(
      `Invalid asset purpose '${purpose}'. Allowed: ${ALLOWED_PURPOSES.join(", ")}.`,
    );
  }

  const sourceTempAssetKey = sourceTempAssetId?.trim() || null;
  if (sourceTempAssetKey) {
    const existing = await prisma.projectAsset.findFirst({
      where: {
        projectId,
        purpose,
        sourceTempAssetId: sourceTempAssetKey,
        userId,
      },
      select: {
        contentType: true,
        id: true,
        publicUrl: true,
        ref: true,
        sizeBytes: true,
      },
    });
    if (existing) {
      return {
        contentType: existing.contentType,
        id: existing.id,
        publicUrl: existing.publicUrl,
        ref: existing.ref,
        sizeBytes: existing.sizeBytes,
        url: getProjectAssetUrl(projectId, existing.id),
      };
    }
  }

  const existing = await prisma.projectAsset.aggregate({
    where: { projectId },
    _count: { id: true },
    _sum: { sizeBytes: true },
  });

  if (existing._count.id >= MAX_PROJECT_ASSETS) {
    throw new Error(`Maksimal ${MAX_PROJECT_ASSETS} gambar per proyek.`);
  }

  if ((existing._sum.sizeBytes || 0) + bytes.length > MAX_PROJECT_ASSET_BYTES) {
    throw new Error("Kapasitas penyimpanan proyek (50 MB) telah penuh.");
  }

  const { publicUrl, ref } = await writeProjectAsset({
    bytes,
    kind,
    projectId,
    userId,
  });

  // Derive the content type from the byte-detected extension in the ref, not
  const storedContentType = contentTypeFromRef(ref);

  const asset = await prisma.projectAsset.create({
    data: {
      contentType: storedContentType,
      projectId,
      publicUrl,
      purpose,
      ref,
      sizeBytes: bytes.length,
      sourceTempAssetId: sourceTempAssetKey,
      userId,
    },
    select: { id: true, publicUrl: true, ref: true },
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
    publicUrl: asset.publicUrl,
    ref: asset.ref,
    sizeBytes: bytes.length,
    url: getProjectAssetUrl(projectId, asset.id),
  };
}

export type ProjectAssetOwner = {
  projectId: string;
  userId: string;
};

export async function readProjectAssetById(
  assetId: string,
  owner?: ProjectAssetOwner,
) {
  const select = { ref: true, projectId: true, userId: true } as const;
  const asset = owner
    ? await prisma.projectAsset.findFirst({
        where: {
          id: assetId,
          projectId: owner.projectId,
          userId: owner.userId,
        },
        select,
      })
    : await prisma.projectAsset.findUnique({
        where: { id: assetId },
        select,
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
