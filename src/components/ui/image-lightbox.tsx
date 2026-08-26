"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import * as React from "react";

export type LightboxImage = {
  src: string;
  alt?: string;
};

export type ImageLightboxProps = {
  images: LightboxImage[];
  initialIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ImageLightbox({
  images,
  initialIndex = 0,
  open,
  onOpenChange,
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = React.useState(initialIndex);
  const touchStartXRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (open) {
      setCurrentIndex(Math.max(0, Math.min(initialIndex, images.length - 1)));
    }
  }, [open, initialIndex, images.length]);

  const total = images.length;
  const current = images[currentIndex];

  const handlePrev = React.useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : total - 1));
  }, [total]);

  const handleNext = React.useCallback(() => {
    setCurrentIndex((prev) => (prev < total - 1 ? prev + 1 : 0));
  }, [total]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handlePrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handleNext();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handlePrev, handleNext, onOpenChange]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartXRef.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartXRef.current === null) {
      return;
    }
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchEndX - touchStartXRef.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        handlePrev();
      } else {
        handleNext();
      }
    }
    touchStartXRef.current = null;
  }

  if (!open || total === 0 || !current) {
    return null;
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Fullscreen Backdrop with elegant frosted glass blur */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-2xl animate-in fade-in-0 duration-200" />

        {/* Fixed Viewport Container */}
        <DialogPrimitive.Content
          className="fixed inset-0 z-[101] flex h-dvh w-screen flex-col items-center justify-center p-4 sm:p-12 outline-none select-none"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={() => onOpenChange(false)}
        >
          <DialogPrimitive.Title className="sr-only">
            Pratinjau Gambar {currentIndex + 1} dari {total}
          </DialogPrimitive.Title>

          {/* Close Button placed at top right of the whole screen */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenChange(false);
            }}
            className="fixed right-5 top-5 z-[105] grid size-10 place-items-center rounded-full bg-black/60 text-white/90 shadow-xl backdrop-blur-md transition hover:bg-black/90 hover:text-white active:scale-95 cursor-pointer border border-white/10"
            aria-label="Tutup"
          >
            <X className="size-5" />
          </button>

          {/* Image Counter placed at bottom center of the whole screen */}
          {total > 1 ? (
            <div
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[105] flex items-center gap-1.5 rounded-full bg-black/60 px-4 py-1 text-xs font-semibold text-white/90 shadow-xl backdrop-blur-md border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <span>{currentIndex + 1}</span>
              <span className="text-white/40">/</span>
              <span>{total}</span>
            </div>
          ) : null}

          {/* Centered Image with consistent max bounds and subtle elevation */}
          <div
            className="relative flex max-h-[82vh] max-w-[88vw] sm:max-w-[84vw] items-center justify-center pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={current.src}
              alt={current.alt || `Gambar ${currentIndex + 1}`}
              className="max-h-[82vh] max-w-[88vw] sm:max-w-[84vw] w-auto h-auto rounded-2xl object-contain shadow-[0_20px_60px_rgba(0,0,0,0.6)] transition-all duration-200"
            />
          </div>

          {/* Navigation Arrows for desktop (fixed on screen sides) */}
          {total > 1 ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrev();
                }}
                className="fixed left-4 sm:left-8 top-1/2 -translate-y-1/2 z-[105] grid size-12 place-items-center rounded-full bg-black/60 text-white/90 shadow-xl backdrop-blur-md transition hover:bg-black/90 hover:text-white active:scale-95 cursor-pointer border border-white/10"
                aria-label="Gambar sebelumnya"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNext();
                }}
                className="fixed right-4 sm:right-8 top-1/2 -translate-y-1/2 z-[105] grid size-12 place-items-center rounded-full bg-black/60 text-white/90 shadow-xl backdrop-blur-md transition hover:bg-black/90 hover:text-white active:scale-95 cursor-pointer border border-white/10"
                aria-label="Gambar berikutnya"
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
