"use client";

import { useRouterState } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";

import { useStreamerMode } from "./streamer-mode-context";

import { mask, type MaskKind } from "@/lib/mask";

type Props = {
  value: string | null | undefined;
  kind: MaskKind;
  className?: string;
};

export function shouldShowRevealButton(
  revealable: boolean,
  streamerMode: boolean,
): boolean {
  return revealable && !streamerMode;
}

export function SensitiveText({ value, kind, className }: Props) {
  const { masked, revealable } = mask(value, kind);
  const streamerMode = useStreamerMode();
  const canReveal = shouldShowRevealButton(revealable, streamerMode);
  const [revealed, setRevealed] = useState(false);
  const id = useId();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  // why: re-mask sensitive values on every route transition
  useEffect(() => {
    setRevealed(false);
  }, [pathname]);

  if (!canReveal) {
    return (
      <span className={className} aria-label="Nilai tersembunyi">
        {masked}
      </span>
    );
  }

  return (
    <span className={className}>
      {revealed ? (
        <span
          aria-live="polite"
          className="select-text"
          title="Sedang ditampilkan tanpa masker — pikirkan sebelum screenshare."
        >
          {value ?? masked}
        </span>
      ) : (
        <span aria-hidden="true" className="select-none">
          {masked}
        </span>
      )}{" "}
      <button
        aria-controls={id}
        className="rounded-radius-sm text-xs text-surface-warm-white/70 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-surface-warm-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#151515]"
        id={id}
        onClick={() => setRevealed((r) => !r)}
        type="button"
      >
        {revealed ? "sembunyikan" : "tampilkan"}
      </button>
    </span>
  );
}
