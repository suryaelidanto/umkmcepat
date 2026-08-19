import { afterEach, describe, expect, it } from "vitest";

import { getStorageProvider } from "@/lib/storage/storage-provider";

describe("storage provider", () => {
  afterEach(() => {
    delete process.env.STORAGE_PROVIDER;
  });

  it("defaults to local", () => {
    delete process.env.STORAGE_PROVIDER;
    expect(getStorageProvider()).toBe("local");
  });

  it("returns r2 when set", () => {
    process.env.STORAGE_PROVIDER = "r2";
    expect(getStorageProvider()).toBe("r2");
  });

  it("rejects unknown values", () => {
    process.env.STORAGE_PROVIDER = "s3";
    expect(() => getStorageProvider()).toThrow(/STORAGE_PROVIDER/);
  });

  it("is case-insensitive", () => {
    process.env.STORAGE_PROVIDER = "R2";
    expect(getStorageProvider()).toBe("r2");
  });
});
