"use client";

import { Paperclip } from "lucide-react";
import { useRef, useState } from "react";

import { ImageLightbox } from "@/components/ui/image-lightbox";
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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  if (attachments.length === 0) {
    return null;
  }

  return (
    <>
      <div className="flex flex-wrap items-end gap-1.5 px-spacing-3 pb-spacing-2">
        {attachments.map((item, idx) => (
          <ImageUploadThumb
            className="size-11 cursor-pointer"
            key={item.id}
            onClick={() => {
              setLightboxIndex(idx);
              setLightboxOpen(true);
            }}
            onRemove={() => onRemove(item.id)}
            src={item.blobUrl}
            uploading={item.status === "uploading"}
          />
        ))}
      </div>

      <ImageLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        images={attachments.map((a, i) => ({
          src: a.blobUrl,
          alt: a.file.name || `Lampiran ${i + 1}`,
        }))}
        initialIndex={lightboxIndex}
      />
    </>
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
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-surface-warm-white/60 transition hover:bg-surface-warm-white/8 hover:text-surface-warm-white/90 disabled:opacity-30 cursor-pointer"
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
            const result = addAttachments(attachments, files);
            onAdd(result.next, result.rejected);
          }
          event.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />
    </>
  );
}
