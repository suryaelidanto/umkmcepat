import type { UIMessage } from "ai";

import {
  getModerationTimeoutMs,
  moderateProjectRequest,
} from "@/lib/ai/ai-moderation";
import { uploadProjectAsset } from "@/lib/projects/project-asset-upload";
import { readTempImage } from "@/lib/storage/uploads/temp-image-storage";

const TEMP_URL_PREFIX = "/api/uploads/temp-images/";

export type DiscussAssetPhaseResult =
  | {
      status: "ok";
      assetIds: string[];
      imageCount: number;
      messages: UIMessage[];
      tempAssetIds: string[];
      urlRewrites: Map<string, string>;
    }
  | {
      status: "blocked" | "stale" | "unavailable";
      message: string;
      assetIds?: string[];
      messages?: UIMessage[];
      tempAssetIds?: string[];
      urlRewrites?: Map<string, string>;
    };

const MODERATION_UNAVAILABLE_MESSAGE =
  "Pemeriksaan keamanan belum berhasil. Coba lagi sebentar.";
const IMAGE_SAVE_FAILED_MESSAGE =
  "Gambar belum berhasil disimpan. Coba lagi sebentar.";
const IMAGE_STALE_MESSAGE =
  "Gambar unggahan sudah kedaluwarsa. Pilih ulang gambarnya lalu kirim lagi ya.";

type TempImagePartRef = {
  assetId: string;
  partUrl: string;
};

function decodeTempAssetId(partUrl: string): string | null {
  const raw = partUrl.slice(TEMP_URL_PREFIX.length);
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function isImagePartUrl(url: string): boolean {
  return (
    url.startsWith(TEMP_URL_PREFIX) ||
    url.startsWith("/api/media/") ||
    url.startsWith("/media/")
  );
}

function latestUserMessageIndex(messages: UIMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]!.role === "user") {
      return index;
    }
  }
  return -1;
}

export function rewriteTempImageParts(
  messages: UIMessage[],
  urlRewrites: Map<string, string>,
): UIMessage[] {
  if (urlRewrites.size === 0) {
    return messages;
  }
  return messages.map((message) => {
    let touched = false;
    const parts = message.parts.map((part) => {
      if (part.type !== "file") {
        return part;
      }
      const rewritten = urlRewrites.get(part.url);
      if (!rewritten) {
        return part;
      }
      touched = true;
      return { ...part, url: rewritten };
    });
    return touched ? { ...message, parts } : message;
  });
}

export async function prepareDiscussTurnAssets({
  messages,
  projectId,
  turnId,
  userId,
}: {
  messages: UIMessage[];
  projectId: string;
  turnId: string;
  userId: string;
}): Promise<DiscussAssetPhaseResult> {
  const latestUserIndex = latestUserMessageIndex(messages);
  if (latestUserIndex === -1) {
    return {
      assetIds: [],
      imageCount: 0,
      messages,
      status: "ok",
      tempAssetIds: [],
      urlRewrites: new Map(),
    };
  }
  const latestUser = messages[latestUserIndex]!;

  const tempRefs = new Map<string, TempImagePartRef>();
  let imageCount = 0;
  for (const part of latestUser.parts) {
    if (part.type !== "file" || !isImagePartUrl(part.url)) {
      continue;
    }
    imageCount += 1;
    if (!part.url.startsWith(TEMP_URL_PREFIX)) {
      continue;
    }
    const assetId = decodeTempAssetId(part.url);
    if (!assetId || tempRefs.has(part.url)) {
      continue;
    }
    tempRefs.set(part.url, { assetId, partUrl: part.url });
  }

  if (imageCount === 0) {
    return {
      assetIds: [],
      imageCount: 0,
      messages,
      status: "ok",
      tempAssetIds: [],
      urlRewrites: new Map(),
    };
  }

  const uniqueRefs = [...tempRefs.values()];

  const readImages = await Promise.all(
    uniqueRefs.map(async (ref) => {
      try {
        const stored = await readTempImage(userId, ref.assetId);
        return { ref, stored };
      } catch {
        return null;
      }
    }),
  );
  if (readImages.some((entry) => entry === null)) {
    return { status: "stale", message: IMAGE_STALE_MESSAGE };
  }

  const moderationResults = await Promise.all(
    readImages.map(async (entry) => {
      try {
        return await moderateProjectRequest(
          "",
          [{ bytes: entry!.stored.body, mediaType: entry!.stored.contentType }],
          getModerationTimeoutMs(),
          { projectId, turnId },
        );
      } catch {
        return null;
      }
    }),
  );
  for (const result of moderationResults) {
    if (result === null) {
      return { status: "unavailable", message: MODERATION_UNAVAILABLE_MESSAGE };
    }
    if (!result.allowed) {
      return { status: "blocked", message: result.message };
    }
  }

  const promotedAssets: Array<{ assetId: string; partUrl: string }> = [];
  const promotedTempAssetIds: string[] = [];
  const urlRewrites = new Map<string, string>();
  for (const entry of readImages) {
    try {
      const asset = await uploadProjectAsset({
        bytes: entry!.stored.body,
        projectId,
        purpose: "business-image",
        sourceTempAssetId: entry!.ref.assetId,
        userId,
      });
      promotedTempAssetIds.push(entry!.ref.assetId);
      promotedAssets.push({ assetId: asset.id, partUrl: entry!.ref.partUrl });
      urlRewrites.set(entry!.ref.partUrl, `/api/media/${asset.id}`);
    } catch {
      return {
        assetIds: promotedAssets.map((asset) => asset.assetId),
        message: IMAGE_SAVE_FAILED_MESSAGE,
        messages: rewriteTempImageParts(messages, urlRewrites),
        status: "unavailable",
        tempAssetIds: promotedTempAssetIds,
        urlRewrites,
      };
    }
  }

  return {
    assetIds: promotedAssets.map((asset) => asset.assetId),
    imageCount,
    messages: rewriteTempImageParts(messages, urlRewrites),
    status: "ok",
    tempAssetIds: promotedTempAssetIds,
    urlRewrites,
  };
}
