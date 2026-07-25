export const MAX_COMPOSER_IMAGES = 6;

export type PendingAttachment = {
  blobUrl: string;
  file: File;
  id: string;
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
  const accepted = files.slice(0, Math.max(0, room));
  const rejected = files.slice(Math.max(0, room));
  const additions: PendingAttachment[] = accepted.map((file) => ({
    blobUrl: URL.createObjectURL(file),
    file,
    id: nextId(),
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

export function toUploadPlan(
  current: PendingAttachment[],
): { file: File; id: string }[] {
  return current.map((item) => ({ file: item.file, id: item.id }));
}
