"use client";

import { Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type ImageUploadThumbProps = {
  src: string;
  alt?: string;
  uploading?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
};

export function ImageUploadThumb({
  src,
  alt = "",
  uploading = false,
  onRemove,
  onClick,
  className,
}: ImageUploadThumbProps) {
  return (
    <div
      onClick={uploading ? undefined : onClick}
      className={cn(
        "group relative shrink-0 overflow-hidden rounded-xl border border-black/10 bg-black/5 dark:border-white/12 dark:bg-white/5",
        onClick &&
          !uploading &&
          "cursor-pointer transition hover:opacity-90 active:scale-98",
        className,
      )}
    >
      <img alt={alt} className="size-full object-cover" src={src} />
      {uploading ? (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[1px]"
          role="status"
        >
          <Loader2 aria-hidden className="size-4 animate-spin text-white" />
          <span className="sr-only">Mengunggah</span>
        </div>
      ) : onRemove ? (
        <button
          aria-label="Hapus gambar"
          className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/70 text-white shadow-xs transition hover:bg-black active:scale-95 cursor-pointer z-10"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          type="button"
        >
          <X className="size-3" strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}
