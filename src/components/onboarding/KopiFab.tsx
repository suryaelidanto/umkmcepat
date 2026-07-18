"use client";

import { useEffect, useState } from "react";
import {
  Joyride,
  STATUS,
  type EventData,
  type TooltipRenderProps,
} from "react-joyride";

import { OnboardingMascot } from "@/components/onboarding/KopiMascot";

const FAB_HOME_FAQ = [
  {
    q: "Cara mulai buat website?",
    a: "Tulis kebutuhan usahamu di kotak atas, klik tombol panah, tunggu AI buatkan website pertamamu.",
  },
  {
    q: "Apa itu Energi?",
    a: "Energi = biaya model AI. Reset setiap hari. Kalau habis, besoknya terisi lagi.",
  },
  {
    q: "Berapa lama proses build?",
    a: "Biasanya 1-3 menit. Tergantung panjang prompt dan beban server saat itu.",
  },
];

const FAB_WORKSHOP_FAQ = [
  {
    q: "Cara edit lagi?",
    a: "Bilang ke AI apa yang mau diubah. Contoh: 'ganti warna jadi biru' atau 'tambah halaman kontak'.",
  },
  {
    q: "Cara lihat hasil jadi?",
    a: "Klik 'Lihat live' di panel kanan. Itu URL publik untuk pelangganmu.",
  },
  {
    q: "Kenapa build gagal?",
    a: "Biasanya prompt terlalu panjang atau ambigu. Coba perpendek, jelaskan satu hal pada satu waktu.",
  },
];

const HOME_TOUR_STEPS = [
  {
    target: "#hero-heading",
    placement: "bottom" as const,
    title: "Hai, aku Kopi",
    content: "Halaman ini ngerangkai website-mu dari kalimat yang kamu tulis.",
  },
  {
    target: "#hero-prompt",
    placement: "top" as const,
    title: "Tulis kebutuhan usahamu",
    content:
      "Contoh: 'Saya jual produk rumahan, pelanggan pesan lewat WhatsApp.'",
  },
  {
    target: 'button[aria-label="Buat website"]',
    placement: "top" as const,
    title: "Kirim",
    content: "AI akan tanya balik sampai brief-nya siap, lalu mulai bikin.",
  },
];

const WORKSHOP_TOUR_STEPS = [
  {
    target: "#workspace-message",
    placement: "top" as const,
    title: "Ngobrol dengan AI",
    content:
      "Ketik permintaan di sini. AI langsung kerjakan setelah kamu kirim.",
  },
  {
    target: 'button[aria-label="Buka tampilan"]',
    placement: "left" as const,
    title: "Buka panel preview",
    content:
      "Kalau preview tertutup, klik tombol ini. Preview auto-update setiap AI selesai.",
  },
  {
    target: 'button[aria-label="Buka tampilan"]',
    placement: "left" as const,
    title: "Cek hasil",
    content:
      "Di preview kamu bisa lihat apa yang AI bikin. Kalau ada yang kurang, ketik permintaan lagi di chat.",
  },
];

type Variant = "homepage" | "workspace";

const FAB_DISMISS_KEY = "umkmcepat.fab.dismissed";

export function KopiFab({ variant = "homepage" }: { variant?: Variant }) {
  const [open, setOpen] = useState(false);
  const [tourRun, setTourRun] = useState(false);
  const [fabHidden, setFabHidden] = useState(false);
  const faq = variant === "workspace" ? FAB_WORKSHOP_FAQ : FAB_HOME_FAQ;
  const steps = variant === "workspace" ? WORKSHOP_TOUR_STEPS : HOME_TOUR_STEPS;

  useEffect(() => {
    setFabHidden(window.localStorage.getItem(FAB_DISMISS_KEY) === "1");
  }, []);

  function startTour() {
    setOpen(false);
    setTourRun(true);
  }

  function dismissFab() {
    setFabHidden(true);
    window.localStorage.setItem(FAB_DISMISS_KEY, "1");
  }

  if (fabHidden) {
    return null;
  }

  return (
    <>
      <Joyride
        run={tourRun}
        steps={steps}
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
          if (data.type === "tour:end" || data.status === STATUS.FINISHED) {
            setTourRun(false);
          }
        }}
        options={{
          backgroundColor: "transparent",
          arrowColor: "#191918",
          showProgress: true,
          spotlightRadius: 12,
          zIndex: 60,
        }}
        tooltipComponent={KopiTooltip}
      />

      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-spacing-3">
        {open ? (
          <div className="w-80 rounded-lg border border-white/10 bg-[#191918] p-spacing-5 text-sm shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
            <div className="mb-spacing-4 flex items-center gap-spacing-3">
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full">
                <OnboardingMascot aria-hidden="true" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Punya pertanyaan?</p>
                <p className="text-xs text-surface-warm-white/52">
                  Halo, aku Kopi.
                </p>
              </div>
              <button
                type="button"
                onClick={dismissFab}
                aria-label="Sembunyikan FAB"
                className="rounded-md p-1 text-surface-warm-white/40 transition hover:bg-white/[0.06] hover:text-surface-warm-white"
              >
                ✕
              </button>
            </div>
            <ul className="space-y-spacing-2 text-xs">
              {faq.map((item) => (
                <li key={item.q}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-spacing-3 rounded-md border border-white/[0.06] bg-white/[0.02] px-spacing-4 py-spacing-3 text-surface-warm-white/82 outline-none transition hover:bg-white/[0.05] [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <span className="text-surface-warm-white/40 transition group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="px-spacing-4 py-spacing-3 text-xs leading-5 text-surface-warm-white/62">
                      {item.a}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={startTour}
              className="mt-spacing-5 w-full rounded-md bg-white px-spacing-4 py-spacing-3 text-xs font-semibold text-[#141413] transition hover:bg-white/90"
            >
              Pandu saya
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Bantuan"
          aria-expanded={open}
          className="grid h-12 w-12 place-items-center overflow-hidden rounded-full border border-white/14 bg-[#1a1a18] shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition hover:scale-105 hover:border-white/30"
        >
          <div className="h-9 w-9">
            <OnboardingMascot aria-hidden="true" />
          </div>
        </button>
      </div>
    </>
  );
}

function KopiTooltip({
  backProps,
  closeProps,
  index,
  isLastStep,
  primaryProps,
  skipProps,
  step,
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
          {step.content ? (
            <p className="mt-spacing-2 text-sm leading-6 text-surface-warm-white/72">
              {step.content}
            </p>
          ) : null}
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
            {isLastStep ? "Selesai" : primaryProps.title}
          </button>
        </div>
      </div>
    </div>
  );
}
