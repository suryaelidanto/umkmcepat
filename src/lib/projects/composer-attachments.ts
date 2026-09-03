export const MAX_COMPOSER_IMAGES = 6;

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

export function isAcceptedImageFile(file: File): boolean {
  if (file.type && ACCEPTED_IMAGE_TYPES.has(file.type.toLowerCase())) {
    return true;
  }
  const lowerName = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

export function tempImageUrl(assetId: string): string {
  return `/api/uploads/temp-images/${encodeURIComponent(assetId)}`;
}

export type PendingAttachment = {
  assetId?: string;
  blobUrl: string;
  file: File;
  id: string;
  status: "uploading" | "uploaded";
};

let counter = 0;
function nextId(): string {
  counter += 1;
  return `att_${counter}`;
}

export function addAttachments(
  current: PendingAttachment[],
  files: File[],
): { next: PendingAttachment[]; rejected: File[]; unaccepted: File[] } {
  const room = MAX_COMPOSER_IMAGES - current.length;
  const acceptedTypes = files.filter(isAcceptedImageFile);
  const unaccepted = files.filter((f) => !isAcceptedImageFile(f));

  const uniqueNewFiles = acceptedTypes.filter(
    (file) =>
      !current.some(
        (c) =>
          c.file.name === file.name &&
          c.file.size === file.size &&
          c.file.lastModified === file.lastModified,
      ),
  );
  const accepted = uniqueNewFiles.slice(0, Math.max(0, room));
  const rejected = [
    ...acceptedTypes.filter((f) => !uniqueNewFiles.includes(f)),
    ...uniqueNewFiles.slice(Math.max(0, room)),
  ];
  const additions: PendingAttachment[] = accepted.map((file) => ({
    blobUrl: URL.createObjectURL(file),
    file,
    id: nextId(),
    status: "uploading",
  }));
  return { next: [...current, ...additions], rejected, unaccepted };
}

export function removeAttachment(
  current: PendingAttachment[],
  id: string,
): PendingAttachment[] {
  const removed = current.find((item) => item.id === id);
  if (removed) {
    URL.revokeObjectURL(removed.blobUrl);
  }
  return current.filter((item) => item.id !== id);
}

export function revokeAll(current: PendingAttachment[]): void {
  for (const item of current) {
    URL.revokeObjectURL(item.blobUrl);
  }
}

export function hasUploadingAttachments(current: PendingAttachment[]): boolean {
  return current.some((item) => item.status === "uploading");
}
