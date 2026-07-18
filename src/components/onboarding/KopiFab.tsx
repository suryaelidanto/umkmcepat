"use client";

import { useEffect, useState } from "react";

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
  {
    q: "Kenapa gratis?",
    a: "UMKM Cepat disubsidi owner dan dikembangkan terbuka di Github. Bukan jualan, bantu.",
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

const TOURS = {
  homepage: [
    {
      title: "Mulai dari sini",
      body: "Tulis kebutuhan usahamu di kotak atas.",
    },
    {
      title: "Tunggu sebentar",
      body: "AI akan tanya balik dan susun brief untukmu.",
    },
    {
      title: "Lihat hasilnya",
      body: "Setelah website jadi, kamu bisa edit, deploy, atau minta revisi.",
    },
  ],
  workspace: [
    {
      title: "Ngobrol dengan AI",
      body: "Ketik permintaan di kotak chat. AI langsung kerjakan.",
    },
    {
      title: "Lihat preview",
      body: "Panel kanan otomatis update setelah AI selesai.",
    },
    {
      title: "Pakai atau edit lagi",
      body: "Klik 'Lihat live' untuk publish, atau minta AI revisi.",
    },
  ],
} as const;

type Variant = keyof typeof TOURS;

const TOUR_KEY = "umkmcepat.tour.dismissed";
const FAB_DISMISS_KEY = "umkmcepat.fab.dismissed";

export function KopiFab({ variant = "homepage" }: { variant?: Variant }) {
  const [open, setOpen] = useState(false);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [fabHidden, setFabHidden] = useState(false);
  const faq = variant === "workspace" ? FAB_WORKSHOP_FAQ : FAB_HOME_FAQ;
  const tourSteps = TOURS[variant];

  useEffect(() => {
    setFabHidden(window.localStorage.getItem(FAB_DISMISS_KEY) === "1");
  }, []);

  function startTour() {
    setOpen(false);
    setTourStep(0);
  }

  function endTour(markDismissed: boolean) {
    setTourStep(null);
    if (markDismissed) {
      window.localStorage.setItem(TOUR_KEY, String(Date.now()));
    }
  }

  function dismissFab() {
    setFabHidden(true);
    window.localStorage.setItem(FAB_DISMISS_KEY, "1");
  }

  if (fabHidden && tourStep === null) {
    return null;
  }

  return (
    <>
      {tourStep !== null ? (
        <TourModal
          steps={tourSteps}
          step={tourStep}
          onPrev={() => setTourStep((s) => Math.max(0, (s ?? 0) - 1))}
          onNext={() => {
            if (tourStep >= tourSteps.length - 1) {
              endTour(false);
            } else {
              setTourStep(tourStep + 1);
            }
          }}
          onSkip={() => endTour(true)}
        />
      ) : null}

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

function TourModal({
  steps,
  step,
  onPrev,
  onNext,
  onSkip,
}: {
  steps: readonly { title: string; body: string }[];
  step: number;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const current = steps[step];
  const isLast = step === steps.length - 1;
  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-50 bg-black/55" />
      <div
        role="dialog"
        aria-modal="true"
        className="pointer-events-auto fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-md border border-white/15 bg-[#191918] px-spacing-8 py-spacing-7 text-sm text-surface-warm-white shadow-[0_24px_80px_rgba(0,0,0,0.7)]"
        style={{ width: "min(28rem, 90vw)" }}
      >
        <div className="flex items-center gap-spacing-3">
          <div className="h-10 w-10 shrink-0">
            <OnboardingMascot aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold">{current.title}</p>
            <p className="mt-spacing-2 text-xs text-surface-warm-white/64">
              {current.body}
            </p>
          </div>
        </div>
        <div className="mt-spacing-6 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={onSkip}
            className="text-surface-warm-white/56 underline-offset-4 transition hover:text-surface-warm-white hover:underline"
          >
            Lewati
          </button>
          <div className="flex items-center gap-spacing-3">
            {step > 0 ? (
              <button
                type="button"
                onClick={onPrev}
                className="rounded-md border border-white/14 px-spacing-4 py-spacing-2 text-surface-warm-white transition hover:bg-white/[0.06]"
              >
                Kembali
              </button>
            ) : null}
            <button
              type="button"
              onClick={onNext}
              className="rounded-md bg-white px-spacing-5 py-spacing-2 font-semibold text-[#141413] transition hover:bg-white/90"
            >
              {isLast ? "Selesai" : "Lanjut"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
