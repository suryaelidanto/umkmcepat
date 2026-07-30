import type { FileUIPart } from "ai";

export function createUploadedImageFilePart({
  filename,
  mediaType,
  publicUrl,
}: {
  filename: string;
  mediaType: string;
  publicUrl: string;
}): FileUIPart {
  return {
    filename,
    mediaType: mediaType || "image/png",
    type: "file",
    url: publicUrl,
  };
}
