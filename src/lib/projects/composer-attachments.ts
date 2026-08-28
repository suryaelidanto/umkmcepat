export const MAX_COMPOSER_IMAGES = 6;

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
): { next: PendingAttachment[]; rejected: File[] } {
  const room = MAX_COMPOSER_IMAGES - current.length;
  const uniqueNewFiles = files.filter(
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
    ...files.filter((f) => !uniqueNewFiles.includes(f)),
    ...uniqueNewFiles.slice(Math.max(0, room)),
  ];
  const additions: PendingAttachment[] = accepted.map((file) => ({
    blobUrl: URL.createObjectURL(file),
    file,
    id: nextId(),
    status: "uploading",
  }));
  return { next: [...current, ...additions], rejected };
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

export function toUploadPlan(
  current: PendingAttachment[],
): { assetId?: string; file: File; id: string }[] {
  return current.map((item) => ({
    assetId: item.assetId,
    file: item.file,
    id: item.id,
  }));
}
