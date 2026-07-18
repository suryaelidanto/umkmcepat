"use client";

// PROTOTYPE throwaway — switch "Website kamu" section shells.

import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";

export type ProjectsSectionVariant = "A" | "B" | "C" | "D" | "E";

export const PROJECTS_SECTION_VARIANTS: {
  key: ProjectsSectionVariant;
  label: string;
}[] = [
  { key: "A", label: "Current box" },
  { key: "B", label: "Flat open" },
  { key: "C", label: "Elevated match" },
  { key: "D", label: "Dense rows" },
  { key: "E", label: "Index table" },
];

export function ProjectsSectionSwitcher({
  current,
}: {
  current: ProjectsSectionVariant;
}) {
  const navigate = useNavigate({ from: "/" });
  const index = PROJECTS_SECTION_VARIANTS.findIndex((v) => v.key === current);
  const safeIndex = index < 0 ? 0 : index;
  const meta = PROJECTS_SECTION_VARIANTS[safeIndex];

  function go(nextIndex: number) {
    const wrapped =
      (nextIndex + PROJECTS_SECTION_VARIANTS.length) %
      PROJECTS_SECTION_VARIANTS.length;
    const key = PROJECTS_SECTION_VARIANTS[wrapped].key;
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
      aria-label="Projects section prototype switcher"
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
