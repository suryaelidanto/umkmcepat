import type { FileUIPart } from "ai";

export function createUploadedImageFilePart({
  filename,
  mediaType,
  url,
}: {
  filename: string;
  mediaType: string;
  url: string;
}): FileUIPart {
  return {
    filename,
    mediaType: mediaType || "image/png",
    type: "file",
    url,
  };
}
