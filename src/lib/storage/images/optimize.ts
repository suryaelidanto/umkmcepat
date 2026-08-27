import sharp from "sharp";

export type OptimizedImageResult = {
  bytes: Buffer;
  contentType: "image/webp";
  format: "webp";
};

export async function optimizeImageToWebp(
  inputBytes: Buffer,
): Promise<OptimizedImageResult> {
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
