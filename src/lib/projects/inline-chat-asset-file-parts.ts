import type { UIMessage } from "ai";

import { readProjectAssetById } from "@/lib/projects/project-asset-upload";

const MEDIA_ASSET_PREFIX = "/media/";

export async function inlineChatAssetFileParts(
  messages: UIMessage[],
): Promise<UIMessage[]> {
  return Promise.all(
    messages.map(async (message) => ({
      ...message,
      parts: (await Promise.all(
        message.parts.map(async (part) => {
          if (
            part.type !== "file" ||
            !part.url.startsWith(MEDIA_ASSET_PREFIX)
          ) {
            return part;
          }

          const assetId = part.url.slice(MEDIA_ASSET_PREFIX.length);
          const stored = await readProjectAssetById(assetId);
          if (!stored) {
            return part;
          }

          const mediaType = stored.contentType || part.mediaType || "image/png";
          return {
            ...part,
            mediaType,
            url: `data:${mediaType};base64,${Buffer.from(stored.body).toString("base64")}`,
          };
        }),
      )) as UIMessage["parts"],
    })),
  );
}
