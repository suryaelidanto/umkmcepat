"use client";

import { Button } from "@/components/ui/button";

export function HeldBuildRecommendationNotice({
  canBuild = true,
  onBuild,
  onOpen,
}: {
  canBuild?: boolean;
  onBuild: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="rounded-[22px] border border-surface-warm-white/10 bg-[#1d1d1a] px-spacing-5 py-spacing-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
      <div className="flex flex-wrap items-center justify-between gap-spacing-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-surface-warm-white">
            Rancangan website disimpan
          </p>
          <p className="mt-spacing-1 text-xs leading-5 text-surface-warm-white/52">
            Lanjutkan diskusi dulu, atau buka rancangan saat siap membuat
            website.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-spacing-2">
          <Button
            type="button"
            variant="outline"
            onClick={onOpen}
            className="h-9 rounded-[12px] border-surface-warm-white/12 bg-transparent px-spacing-4 text-xs text-surface-warm-white/78 hover:bg-surface-warm-white/8"
          >
            Buka rancangan
          </Button>
          <Button
            type="button"
            disabled={!canBuild}
            onClick={onBuild}
            className="h-9 rounded-[12px] bg-surface-warm-white px-spacing-4 text-xs text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-50"
          >
            Mulai buat website
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CompletedBuildNotice({
  onDiscuss,
  onPreview,
  variant = "ready",
}: {
  onDiscuss: () => void;
  onPreview: () => void;
  variant?: "ready" | "recovery";
}) {
  const isRecovery = variant === "recovery";

  return (
    <div
      className={`rounded-[22px] border px-spacing-5 py-spacing-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] ${
        isRecovery
          ? "border-[#f6d365]/18 bg-[#242015]"
          : "border-[#8ce99a]/18 bg-[#1d211c]"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-spacing-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-surface-warm-white">
            {isRecovery
              ? "Website terakhir masih aman"
              : "Website siap dilihat"}
          </p>
          <p className="mt-spacing-1 text-xs leading-5 text-surface-warm-white/52">
            {isRecovery
              ? "Pembuatan terbaru belum selesai, tapi tampilan terakhir yang berhasil tetap aman. Kamu bisa cek hasil lama atau lanjut ngobrol dengan AI."
              : "Lihat hasilnya dulu. Kalau ada yang kurang pas, lanjut ngobrol dengan AI."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-spacing-2">
          <Button
            type="button"
            onClick={onPreview}
            className="h-9 rounded-[12px] bg-surface-warm-white px-spacing-4 text-xs text-foreground-primary hover:bg-surface-warm-white/86"
          >
            Lihat website
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onDiscuss}
            className="h-9 rounded-[12px] border-surface-warm-white/12 bg-transparent px-spacing-4 text-xs text-surface-warm-white/78 hover:bg-surface-warm-white/8"
          >
            Chat dengan AI
          </Button>
        </div>
      </div>
    </div>
  );
}
