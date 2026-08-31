export type ImageUploadDraftItem = {
  assetId: string;
  url: string;
};

const MAX_DRAFT_AGE_MS = 50 * 60 * 1000;

export function imageUploadDraftKey(
  projectId: string,
  imageUploadId: string,
): string {
  return `umkmcepat:image-upload-draft:${projectId}:${imageUploadId}`;
}

type DraftStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function readImageUploadDraft(
  storage: DraftStorage,
  key: string,
): ImageUploadDraftItem[] {
  const raw = storage.getItem(key);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as {
      savedAt?: unknown;
      uploads?: unknown;
    };
    if (
      typeof parsed.savedAt !== "number" ||
      !Array.isArray(parsed.uploads) ||
      Date.now() - parsed.savedAt > MAX_DRAFT_AGE_MS
    ) {
      storage.removeItem(key);
      return [];
    }
    const uploads: ImageUploadDraftItem[] = [];
    for (const item of parsed.uploads) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as ImageUploadDraftItem).assetId === "string" &&
        typeof (item as ImageUploadDraftItem).url === "string"
      ) {
        uploads.push({
          assetId: (item as ImageUploadDraftItem).assetId,
          url: (item as ImageUploadDraftItem).url,
        });
      }
    }
    return uploads;
  } catch {
    storage.removeItem(key);
    return [];
  }
}

export function writeImageUploadDraft(
  storage: DraftStorage,
  key: string,
  uploads: ImageUploadDraftItem[],
): void {
  if (uploads.length === 0) {
    storage.removeItem(key);
    return;
  }
  try {
    storage.setItem(
      key,
      JSON.stringify({ savedAt: Date.now(), uploads: [...uploads] }),
    );
  } catch {
    // Quota/private-mode failures must never block composing a message.
  }
}

export function clearImageUploadDraft(
  storage: DraftStorage,
  key: string,
): void {
  storage.removeItem(key);
}
