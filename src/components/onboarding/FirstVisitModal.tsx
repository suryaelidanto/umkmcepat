"use client";

import { useEffect, useState } from "react";

import { OnboardingMascot } from "@/components/onboarding/KopiMascot";

const KEY = "umkmcepat.greeted";

export function FirstVisitModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(KEY)) {
      return;
    }
    setOpen(true);
  }, []);

  function dismiss() {
    window.localStorage.setItem(KEY, String(Date.now()));
    setOpen(false);
  }

  if (!open) {
    return null;
  }

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-50 bg-black/55" />
      <div
        role="dialog"
        aria-modal="true"
        className="pointer-events-auto fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-md border border-white/15 bg-[#191918] px-spacing-9 py-spacing-9 text-sm text-surface-warm-white shadow-[0_24px_80px_rgba(0,0,0,0.7)]"
        style={{ width: "min(24rem, 90vw)" }}
      >
        <div className="flex items-center gap-spacing-3">
          <div className="h-10 w-10 shrink-0">
            <OnboardingMascot aria-hidden="true" />
          </div>
          <p className="text-base font-semibold tracking-[-0.02em]">
            Mau panduan singkat?
          </p>
        </div>
        <p className="mt-spacing-4 text-xs leading-5 text-surface-warm-white/64">
          Aku Kopi, bisa temani kamu 3 langkah. Bisa juga jalan sendiri dan
          tanya kalau perlu — klik aku di pojok kanan bawah kapan saja.
        </p>
        <div className="mt-spacing-7 flex items-center justify-end gap-spacing-3">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md border border-white/14 px-spacing-5 py-spacing-2 text-xs text-surface-warm-white transition hover:bg-white/[0.06]"
          >
            Nanti aja
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md bg-white px-spacing-5 py-spacing-2 text-xs font-semibold text-[#141413] transition hover:bg-white/90"
          >
            Mulai
          </button>
        </div>
      </div>
    </>
  );
}
