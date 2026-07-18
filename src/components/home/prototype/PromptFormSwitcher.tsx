"use client";

// PROTOTYPE throwaway — switch hero prompt shell skins.

import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";

import type { PromptShellAppearance } from "@/components/projects/HomePromptForm";

import { cn } from "@/lib/utils";

const VARIANTS: { key: PromptShellAppearance; label: string }[] = [
  { key: "A", label: "Current solid" },
  { key: "B", label: "Frosted glass" },
  { key: "C", label: "Soft pill" },
  { key: "D", label: "Outline only" },
  { key: "E", label: "Elevated solid" },
];

export function PromptFormSwitcher({
  current,
}: {
  current: PromptShellAppearance;
}) {
  const navigate = useNavigate({ from: "/" });
  const index = VARIANTS.findIndex((v) => v.key === current);
  const safeIndex = index < 0 ? 0 : index;
  const meta = VARIANTS[safeIndex];

  function go(nextIndex: number) {
    const wrapped = (nextIndex + VARIANTS.length) % VARIANTS.length;
    const key = VARIANTS[wrapped].key;
    void navigate({
      to: "/",
      search: { variant: key },
      replace: true,
    });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(safeIndex - 1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        go(safeIndex + 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [safeIndex, navigate]);

  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-1",
        "rounded-full border border-white/15 bg-black/90 px-2 py-1.5 text-white shadow-2xl backdrop-blur",
      )}
      role="navigation"
      aria-label="Prompt form prototype switcher"
    >
      <button
        type="button"
        onClick={() => go(safeIndex - 1)}
        className="grid size-9 place-items-center rounded-full hover:bg-white/10"
        aria-label="Varian sebelumnya"
      >
        <ChevronLeft className="size-4" />
      </button>
      <div className="min-w-[11.5rem] px-2 text-center text-xs font-medium tracking-wide">
        <span className="text-white/45">{meta.key}</span>
        <span className="mx-1.5 text-white/25">—</span>
        <span>{meta.label}</span>
      </div>
      <button
        type="button"
        onClick={() => go(safeIndex + 1)}
        className="grid size-9 place-items-center rounded-full hover:bg-white/10"
        aria-label="Varian berikutnya"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
