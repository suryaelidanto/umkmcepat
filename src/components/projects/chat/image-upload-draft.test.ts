import { describe, expect, it } from "vitest";

import {
  clearImageUploadDraft,
  imageUploadDraftKey,
  readImageUploadDraft,
  writeImageUploadDraft,
} from "./image-upload-draft";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    peek: () => map,
  };
}

describe("image upload draft persistence", () => {
  it("round-trips the picked uploads under the project + card key", () => {
    const storage = memoryStorage();
    const key = imageUploadDraftKey("p1", "img1");

    writeImageUploadDraft(storage, key, [
      { assetId: "tok_1", url: "/api/uploads/temp-images/tok_1" },
    ]);

    expect(readImageUploadDraft(storage, key)).toEqual([
      { assetId: "tok_1", url: "/api/uploads/temp-images/tok_1" },
    ]);
  });

  it("drops drafts older than the temp-image TTL window", () => {
    const key = imageUploadDraftKey("p1", "img1");
    const storage = memoryStorage({
      [key]: JSON.stringify({
        savedAt: Date.now() - 51 * 60 * 1000,
        uploads: [
          { assetId: "tok_old", url: "/api/uploads/temp-images/tok_old" },
        ],
      }),
    });

    expect(readImageUploadDraft(storage, key)).toEqual([]);
    expect(storage.peek().has(key)).toBe(false);
  });

  it("clears the draft and tolerates corrupt or non-array payloads", () => {
    const key = imageUploadDraftKey("p1", "img1");
    const storage = memoryStorage({ [key]: "{not json" });

    expect(readImageUploadDraft(storage, key)).toEqual([]);
    expect(storage.peek().has(key)).toBe(false);

    writeImageUploadDraft(storage, key, [{ assetId: "tok_1", url: "/u" }]);
    clearImageUploadDraft(storage, key);
    expect(readImageUploadDraft(storage, key)).toEqual([]);
  });

  it("skips malformed entries and writes nothing for an empty list", () => {
    const key = imageUploadDraftKey("p1", "img1");
    const storage = memoryStorage({
      [key]: JSON.stringify({
        savedAt: Date.now(),
        uploads: [
          { assetId: 5, url: "/u" },
          "junk",
          { assetId: "tok_ok", url: "/ok" },
        ],
      }),
    });

    expect(readImageUploadDraft(storage, key)).toEqual([
      { assetId: "tok_ok", url: "/ok" },
    ]);

    writeImageUploadDraft(storage, key, []);
    expect(storage.peek().has(key)).toBe(false);
  });
});
