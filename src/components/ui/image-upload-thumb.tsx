"use client";

import { Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type ImageUploadThumbProps = {
  src: string;
  alt?: string;
  uploading?: boolean;
  onRemove?: () => void;
  className?: string;
};

export function ImageUploadThumb({
  src,
  alt = "",
  uploading = false,
  onRemove,
  className,
}: ImageUploadThumbProps) {
  return (
    <div
      className={cn(
        "group relative shrink-0 overflow-hidden rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/5",
        className,
      )}
    >
      <img alt={alt} className="size-full object-cover" src={src} />
      {uploading ? (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/45"
          role="status"
        >
          <Loader2 aria-hidden className="size-4 animate-spin text-white" />
          <span className="sr-only">Mengunggah</span>
        </div>
      ) : onRemove ? (
        <button
          aria-label="Hapus gambar"
          className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
          onClick={onRemove}
          type="button"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
