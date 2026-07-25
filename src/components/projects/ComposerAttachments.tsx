import { X } from "lucide-react";
import { useRef } from "react";

import {
  MAX_COMPOSER_IMAGES,
  addAttachments,
  type PendingAttachment,
} from "@/lib/projects/composer-attachments";

export function ComposerAttachments({
  attachments,
  onAdd,
  onRemove,
}: {
  attachments: PendingAttachment[];
  onAdd: (next: PendingAttachment[], rejected: File[]) => void;
  onRemove: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const full = attachments.length >= MAX_COMPOSER_IMAGES;

  return (
    <div className="flex flex-wrap items-center gap-2 px-spacing-3 pb-spacing-2">
      <button
        aria-label="Lampirkan gambar"
        className="inline-flex h-9 w-9 items-center justify-center rounded-radius-md border border-surface-warm-white/10 text-surface-warm-white/70 hover:bg-surface-warm-white/8 disabled:opacity-40"
        disabled={full}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        <span className="text-base">📎</span>
      </button>
      <input
        accept="image/png,image/jpeg,image/webp"
        hidden
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) {
            const { next, rejected } = addAttachments(attachments, files);
            onAdd(next, rejected);
          }
          event.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />
      {attachments.map((item) => (
        <div
          className="relative h-12 w-12 overflow-hidden rounded-radius-md border border-surface-warm-white/10"
          key={item.id}
        >
          <img
            alt=""
            className="h-full w-full object-cover"
            src={item.blobUrl}
          />
          <button
            aria-label="Hapus gambar"
            className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-radius-md bg-surface-warm-white/80 text-black hover:bg-surface-warm-white"
            onClick={() => onRemove(item.id)}
            type="button"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
