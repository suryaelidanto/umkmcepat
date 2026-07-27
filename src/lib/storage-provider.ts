import { getEnv } from "@/lib/config";

export type StorageProvider = "local" | "r2";

export function getStorageProvider(): StorageProvider {
  const provider = getEnv("STORAGE_PROVIDER", "local").toLowerCase();
  if (provider === "local" || provider === "r2") {
    return provider;
  }
  throw new Error(
    `Invalid STORAGE_PROVIDER '${provider}'. Supported values: local, r2.`,
  );
}
