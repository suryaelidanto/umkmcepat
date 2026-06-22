import { mkdir, unlink, writeFile } from "fs/promises";
import { join } from "path";

import { getEnv } from "@/lib/config";

import type {
  StorageProvider,
  UploadInput,
  UploadResult,
} from "@/lib/storage/types";

function safeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._/-]/g, "-").replace(/^\/+/, "");
}

export function createLocalStorageProvider(): StorageProvider {
  const uploadDir = getEnv("UPLOAD_DIR", "public/uploads");
  const publicBaseUrl = getEnv("PUBLIC_UPLOAD_BASE_URL", "/uploads").replace(
    /\/$/,
    "",
  );

  return {
    async upload(input: UploadInput): Promise<UploadResult> {
      const key = safeKey(input.key);
      const fullPath = join(process.cwd(), uploadDir, key);
      await mkdir(join(fullPath, ".."), { recursive: true });
      await writeFile(fullPath, input.buffer);

      return {
        key,
        url: `${publicBaseUrl}/${key}`,
      };
    },

    async delete(keys: string[]): Promise<void> {
      await Promise.allSettled(
        keys
          .filter(Boolean)
          .map((key) => unlink(join(process.cwd(), uploadDir, safeKey(key)))),
      );
    },
  };
}
