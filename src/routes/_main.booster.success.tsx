import { createFileRoute, Link } from "@tanstack/react-router";

import { DarkPage } from "@/components/ui/surface";

export const Route = createFileRoute("/_main/booster/success")({
  component: BoosterSuccessPage,
});

function BoosterSuccessPage() {
  return (
    <DarkPage className="flex min-h-[60vh] items-center justify-center py-spacing-14">
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-green-500/10">
          <svg
            className="size-10 text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="text-xl font-bold tracking-tight text-[#fcfbf8]">
          Pembayaran Sedang Diproses
        </h1>

        <p className="text-sm leading-relaxed text-surface-warm-white/60">
          Tagihan kamu sudah dibayar. Silakan kembali ke tab UMKM Cepat
          sebelumnya — energi premium akan ditambahkan secara otomatis dalam
          beberapa saat.
        </p>

        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-radius-lg bg-[#fcfbf8] px-6 py-3 text-sm font-bold text-[#1c1c1c] transition hover:bg-[#eceae4]"
        >
          Kembali ke Beranda
        </Link>
      </div>
    </DarkPage>
  );
}
