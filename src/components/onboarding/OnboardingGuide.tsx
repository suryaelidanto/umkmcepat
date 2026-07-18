"use client";

import {
  Joyride,
  STATUS,
  type EventData,
  type TooltipRenderProps,
} from "react-joyride";

import { OnboardingMascot } from "@/components/onboarding/KopiMascot";

const FIRST_VISIT_KEY = "umkmcepat.onboarding.v1";

const STEPS = [
  {
    target: "#hero-prompt",
    placement: "top" as const,
    title: "Hai, aku Kopi",
    content:
      "Jawab pertanyaan singkat soal usahamu. Nanti AI bantu buatkan website yang siap dibagikan.",
  },
  {
    target: "#hero-prompt",
    placement: "top" as const,
    title: "Tulis di sini",
    content:
      "Contoh: Saya jual produk rumahan, pelanggan bisa pesan lewat WhatsApp.",
  },
  {
    target: 'button[aria-label="Buat website"]',
    placement: "top" as const,
    title: "Mulai",
    content: "Klik tombol ini. Tidak perlu login dulu — bisa lanjut nanti.",
  },
];

export function OnboardingGuide() {
  if (typeof window !== "undefined") {
    const seen = window.localStorage.getItem(FIRST_VISIT_KEY);
    if (seen) {
      return null;
    }
  }

  return (
    <Joyride
      run
      steps={STEPS}
      continuous
      scrollToFirstStep
      locale={{
        back: "Kembali",
        close: "Tutup",
        last: "Selesai",
        next: "Lanjut",
        skip: "Lewati",
      }}
      onEvent={(data: EventData) => {
        if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
          window.localStorage.setItem(FIRST_VISIT_KEY, String(Date.now()));
        }
      }}
      options={{
        backgroundColor: "transparent",
        arrowColor: "#191918",
        spotlightRadius: 12,
        zIndex: 60,
      }}
      tooltipComponent={KopiTooltip}
    />
  );
}

function KopiTooltip({
  index,
  step,
  backProps,
  closeProps,
  primaryProps,
  skipProps,
  tooltipProps,
}: TooltipRenderProps) {
  return (
    <div
      {...tooltipProps}
      className="relative max-w-xs overflow-visible rounded-lg border border-white/10 bg-[#191918] px-spacing-7 py-spacing-6 text-surface-warm-white shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
    >
      <button
        {...closeProps}
        className="absolute right-spacing-5 top-spacing-5 text-surface-warm-white/48 transition hover:text-surface-warm-white"
        aria-label="Tutup"
      >
        ✕
      </button>

      <div className="flex gap-spacing-5">
        <div className="relative h-16 w-16 shrink-0 -translate-y-spacing-8">
          <OnboardingMascot aria-hidden="true" />
        </div>
        <div className="min-w-0 pt-spacing-1">
          {step.title ? (
            <h4 className="text-base font-semibold tracking-[-0.02em]">
              {step.title}
            </h4>
          ) : null}
          <p className="mt-spacing-2 text-sm leading-6 text-surface-warm-white/72">
            {step.content}
          </p>
        </div>
      </div>

      <div className="mt-spacing-6 flex items-center justify-between">
        <button
          {...skipProps}
          className="text-xs text-surface-warm-white/56 underline-offset-4 transition hover:text-surface-warm-white hover:underline"
        >
          {skipProps.title}
        </button>
        <div className="flex items-center gap-spacing-3">
          {index > 0 ? (
            <button
              {...backProps}
              className="rounded-md border border-white/14 px-spacing-4 py-spacing-2 text-sm text-surface-warm-white transition hover:bg-white/[0.06]"
            >
              {backProps.title}
            </button>
          ) : null}
          <button
            {...primaryProps}
            className="rounded-md bg-white px-spacing-5 py-spacing-2 text-sm font-semibold text-[#141413] transition hover:bg-white/90"
          >
            {primaryProps.title}
          </button>
        </div>
      </div>
    </div>
  );
}
