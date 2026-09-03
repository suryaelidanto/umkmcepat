import type { UIMessage } from "ai";

import { devLog } from "@/lib/dev-log";
import { readProjectAssetById } from "@/lib/projects/project-asset-upload";
import { readTempImage } from "@/lib/storage/uploads/temp-image-storage";

export async function inlineChatAssetFileParts(
  messages: UIMessage[],
  owner: { projectId: string; userId: string },
): Promise<UIMessage[]> {
  return Promise.all(
    messages.map(async (message) => {
      const resolvedParts = (
        await Promise.all(
          message.parts.map(async (part) => {
            if (part.type !== "file") {
              return part;
            }

            // Already a data URL or absolute external https URL
            if (
              part.url.startsWith("data:") ||
              part.url.startsWith("https://")
            ) {
              return part;
            }

            // Must be a relative media/upload path
            if (
              !part.url.startsWith("/media/") &&
              !part.url.startsWith("/api/media/") &&
              !part.url.startsWith("/api/uploads/temp-images/")
            ) {
              // Discard unresolvable relative URLs to prevent AI SDK crash
              return null;
            }

            const rawAssetId = part.url.startsWith("/api/media/")
              ? part.url.slice("/api/media/".length)
              : part.url.startsWith("/media/")
                ? part.url.slice("/media/".length)
                : part.url.slice("/api/uploads/temp-images/".length);

            let assetId: string;
            try {
              assetId = decodeURIComponent(rawAssetId);
            } catch {
              return null;
            }

            // 1. Try permanent project asset
            try {
              const stored = await readProjectAssetById(assetId, owner);
              if (
                stored &&
                stored.projectId === owner.projectId &&
                stored.userId === owner.userId
              ) {
                const mediaType =
                  stored.contentType || part.mediaType || "image/jpeg";
                return {
                  ...part,
                  mediaType,
                  url: `data:${mediaType};base64,${Buffer.from(stored.body).toString("base64")}`,
                };
              }
            } catch (err) {
              devLog("inline-chat-asset", "permanent-read-failed", {
                assetId,
                error: err instanceof Error ? err.message : String(err),
              });
            }

            // 2. Try the owner-bound temporary upload token.
            if (part.url.startsWith("/api/uploads/temp-images/")) {
              try {
                const stored = await readTempImage(owner.userId, assetId);
                if (stored.body.length > 0) {
                  const mediaType =
                    stored.contentType || part.mediaType || "image/jpeg";
                  return {
                    ...part,
                    mediaType,
                    url: `data:${mediaType};base64,${Buffer.from(stored.body).toString("base64")}`,
                  };
                }
              } catch (err) {
                devLog("inline-chat-asset", "temp-read-failed", {
                  assetId,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            }

            // Unable to resolve to a valid data URI -> discard part to prevent crash
            return null;
          }),
        )
      ).filter((part): part is NonNullable<typeof part> => part !== null);

      return {
        ...message,
        parts: resolvedParts as UIMessage["parts"],
      };
    }),
  );
}
