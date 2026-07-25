"use client";

import { Paperclip, X } from "lucide-react";
import { useRef } from "react";

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
        <div
          className="group relative h-11 w-11 shrink-0 overflow-hidden rounded-radius-md border border-surface-warm-white/12"
          key={item.id}
        >
          <img
            alt=""
            className="h-full w-full object-cover"
            src={item.blobUrl}
          />
          <button
            aria-label="Hapus gambar"
            className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl-radius-md bg-surface-warm-white/90 text-black opacity-0 transition hover:bg-surface-warm-white group-hover:opacity-100"
            onClick={() => onRemove(item.id)}
            type="button"
          >
            <X className="size-2.5" />
          </button>
        </div>
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
