"use client";

// PROTOTYPE — Efferd-inspired admin A–E. Non-prod only.
// bun run dev → /admin?variant=B

import { useEffect } from "react";

import { ADMIN_VARIANTS, type AdminVariant } from "./prototype/types";
import {
  useAdminVariant,
  useSetAdminVariant,
  variantLabel,
} from "./prototype/useAdminVariant";

function cycle(current: AdminVariant, delta: number): AdminVariant {
  const i = ADMIN_VARIANTS.indexOf(current);
  const next = (i + delta + ADMIN_VARIANTS.length) % ADMIN_VARIANTS.length;
  return ADMIN_VARIANTS[next]!;
}

export function PrototypeSwitcher() {
  const current = useAdminVariant();
  const setVariant = useSetAdminVariant();
  const isProd = process.env.NODE_ENV === "production";

  useEffect(() => {
    if (isProd) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setVariant(cycle(current, -1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setVariant(cycle(current, 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, setVariant, isProd]);

  if (isProd) {
    return null;
  }

  return (
    <div
      aria-label="Prototype variant switcher"
      className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full border border-black/20 bg-[#fcfbf8] px-2 py-1.5 text-[#1c1c1c] shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
      role="toolbar"
    >
      <button
        aria-label="Previous"
        className="rounded-full px-3 py-1 text-sm font-semibold hover:bg-black/5"
        onClick={() => setVariant(cycle(current, -1))}
        type="button"
      >
        ←
      </button>
      <span className="min-w-[12rem] text-center text-xs font-medium">
        {variantLabel(current)}
      </span>
      <button
        aria-label="Next"
        className="rounded-full px-3 py-1 text-sm font-semibold hover:bg-black/5"
        onClick={() => setVariant(cycle(current, 1))}
        type="button"
      >
        →
      </button>
    </div>
  );
}
