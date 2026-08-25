export type ImageFormat = "png" | "jpeg" | "webp";

export const EXT_CONTENT_TYPE: Record<ImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const MAX_IMAGE_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export function contentTypeFromExt(ext: string): string {
  return EXT_TO_CONTENT_TYPE[ext.toLowerCase()] ?? "application/octet-stream";
}

export function detectImageFormat(bytes: Buffer): ImageFormat | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A (8 bytes)
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  // JPEG: FF D8 FF (3 bytes)
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpeg";
  }
  // WEBP: "RIFF" .... "WEBP" (12 bytes)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export function validateImageUploadBuffer(bytes: Buffer):
  | {
      ok: true;
      format: ImageFormat;
      contentType: string;
    }
  | {
      ok: false;
      error: string;
    } {
  if (!bytes || bytes.length === 0) {
    return { ok: false, error: "File gambar kosong." };
  }
  if (bytes.length > MAX_IMAGE_FILE_BYTES) {
    return { ok: false, error: "Ukuran gambar maksimal 5 MB." };
  }
  const format = detectImageFormat(bytes);
  if (!format) {
    return {
      ok: false,
      error: "Format gambar tidak didukung. Gunakan PNG, JPG, atau WEBP.",
    };
  }
  return {
    ok: true,
    format,
    contentType: EXT_CONTENT_TYPE[format],
  };
}
