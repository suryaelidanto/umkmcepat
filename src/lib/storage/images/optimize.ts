import sharp from "sharp";

export type OptimizedImageResult = {
  bytes: Buffer;
  contentType: "image/webp";
  format: "webp";
};

export async function optimizeImageToWebp(
  inputBytes: Buffer,
): Promise<OptimizedImageResult> {
  const BunImage = (
    globalThis as unknown as {
      Bun?: {
        Image?: new (data: Buffer) => { webp: () => Promise<Uint8Array> };
      };
    }
  ).Bun?.Image;

  if (typeof BunImage === "function") {
    try {
      const img = new BunImage(inputBytes);
      const output = await img.webp();
      return {
        bytes: Buffer.from(output),
        contentType: "image/webp",
        format: "webp",
      };
    } catch {
      // Fall through to sharp fallback on edge cases
    }
  }

  const optimized = await sharp(inputBytes)
    .rotate()
    .resize({
      width: 1920,
      height: 1920,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();

  return {
    bytes: optimized,
    contentType: "image/webp",
    format: "webp",
  };
}
