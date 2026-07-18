"use client";

// PROTOTYPE throwaway — floating bar for header/menu/footer skins.

import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";

import {
  CHROME_SKINS,
  parseChromeSkin,
  type ChromeSkin,
} from "@/components/common/chrome-skin";
import { cn } from "@/lib/utils";

export function useChromeSkin(): ChromeSkin {
  return useRouterState({
    select: (state) => {
      const search = state.location.search as Record<string, unknown>;
      return parseChromeSkin(search?.variant);
    },
  });
}

export function ChromeSkinSwitcher() {
  const navigate = useNavigate();
  const current = useChromeSkin();
  const index = CHROME_SKINS.findIndex((v) => v.key === current);
  const safeIndex = index < 0 ? 0 : index;
  const meta = CHROME_SKINS[safeIndex];

  function go(nextIndex: number) {
    const wrapped = (nextIndex + CHROME_SKINS.length) % CHROME_SKINS.length;
    const key = CHROME_SKINS[wrapped].key;
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, variant: key }),
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
  }, [safeIndex]);

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
      aria-label="Chrome skin prototype switcher"
    >
      <button
        type="button"
        onClick={() => go(safeIndex - 1)}
        className="grid size-9 place-items-center rounded-full hover:bg-white/10"
        aria-label="Varian sebelumnya"
      >
        <ChevronLeft className="size-4" />
      </button>
      <div className="min-w-[12rem] px-2 text-center text-xs font-medium tracking-wide">
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
