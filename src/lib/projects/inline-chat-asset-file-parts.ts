import type { UIMessage } from "ai";

import { devLog } from "@/lib/dev-log";
import { readProjectAssetById } from "@/lib/projects/project-asset-upload";
import { getS3Object } from "@/lib/storage/s3-client";

export async function inlineChatAssetFileParts(
  messages: UIMessage[],
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

            const assetId = decodeURIComponent(rawAssetId);

            // 1. Try permanent project asset
            try {
              const stored = await readProjectAssetById(assetId);
              if (stored) {
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

            // 2. Try temporary S3 upload
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
                const body = await getS3Object("private", parsed.key);
                if (body && body.length > 0) {
                  const mediaType =
                    parsed.contentType || part.mediaType || "image/jpeg";
                  return {
                    ...part,
                    mediaType,
                    url: `data:${mediaType};base64,${Buffer.from(body).toString("base64")}`,
                  };
                }
              }
            } catch (err) {
              devLog("inline-chat-asset", "temp-read-failed", {
                assetId,
                error: err instanceof Error ? err.message : String(err),
              });
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
