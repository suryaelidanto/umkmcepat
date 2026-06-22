import { getConfiguredProvider } from "@/lib/config";
import { createLocalStorageProvider } from "@/lib/storage/providers/local";
import { createS3StorageProvider } from "@/lib/storage/providers/s3";

import type { StorageProvider } from "@/lib/storage/types";

export function createStorageProvider(): StorageProvider {
  const provider = getConfiguredProvider("storage");

  if (provider === "local") {
    return createLocalStorageProvider();
  }

  if (["s3", "r2", "minio"].includes(provider)) {
    return createS3StorageProvider();
  }

  throw new Error(
    `Storage provider '${provider}' is registered but not implemented yet.`,
  );
}

export const storage = createStorageProvider();

export async function fileToBuffer(file: File): Promise<Buffer> {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export function buildImageKey(fileName: string, contentType?: string): string {
  const extension = contentType?.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  return `landing-images/${fileName}.${extension}`;
}
