"use client";

import { Paperclip } from "lucide-react";
import { useRef } from "react";

import { ImageUploadThumb } from "@/components/ui/image-upload-thumb";
import {
  MAX_COMPOSER_IMAGES,
  addAttachments,
  type PendingAttachment,
} from "@/lib/projects/composer-attachments";

export function ComposerAttachments({
  attachments,
  onRemove,
}: {
  attachments: PendingAttachment[];
  onRemove: (id: string) => void;
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-end gap-1.5 px-spacing-3 pb-spacing-2">
      {attachments.map((item) => (
        <ImageUploadThumb
          className="size-11"
          key={item.id}
          onRemove={() => onRemove(item.id)}
          src={item.blobUrl}
          uploading={item.status === "uploading"}
        />
      ))}
    </div>
  );
}

export function ComposerAttachButton({
  attachments,
  onAdd,
}: {
  attachments: PendingAttachment[];
  onAdd: (next: PendingAttachment[], rejected: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        aria-label="Lampirkan gambar"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-surface-warm-white/60 transition hover:bg-surface-warm-white/8 hover:text-surface-warm-white/90 disabled:opacity-30"
        disabled={attachments.length >= MAX_COMPOSER_IMAGES}
        onClick={() => inputRef.current?.click()}
        title={
          attachments.length >= MAX_COMPOSER_IMAGES
            ? `Maksimal ${MAX_COMPOSER_IMAGES} gambar`
            : "Lampirkan gambar"
        }
        type="button"
      >
        <Paperclip className="size-4" />
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
    </>
  );
}
