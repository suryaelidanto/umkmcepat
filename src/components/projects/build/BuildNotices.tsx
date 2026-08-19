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
    <div className="rounded-[22px] border border-border bg-card px-spacing-5 py-spacing-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-spacing-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Rancangan website disimpan
          </p>
          <p className="mt-spacing-1 text-xs leading-5 text-muted-foreground">
            Lanjutkan diskusi dulu, atau buka rancangan saat siap membuat
            website.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-spacing-2">
          <Button
            type="button"
            variant="outline"
            onClick={onOpen}
            className="h-9 rounded-[12px] border-border bg-transparent px-spacing-4 text-xs text-foreground hover:bg-muted"
          >
            Buka rancangan
          </Button>
          <Button
            type="button"
            disabled={!canBuild}
            onClick={onBuild}
            className="h-9 rounded-[12px] bg-[#1c1c1c] text-white px-spacing-4 text-xs hover:bg-black disabled:opacity-50 dark:bg-surface-warm-white dark:text-[#141413] dark:hover:bg-white"
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
      className={`rounded-[22px] border px-spacing-5 py-spacing-4 shadow-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] ${
        isRecovery
          ? "border-status-warning-border bg-status-warning-subtle text-foreground dark:border-[#f6d365]/18 dark:bg-[#242015]"
          : "border-status-success-border bg-status-success-subtle text-foreground dark:border-[#8ce99a]/18 dark:bg-[#1d211c]"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-spacing-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground dark:text-surface-warm-white">
            {isRecovery
              ? "Website terakhir masih aman"
              : "Website siap dilihat"}
          </p>
          <p className="mt-spacing-1 text-xs leading-5 text-text-secondary dark:text-surface-warm-white/52">
            {isRecovery
              ? "Pembuatan terbaru belum selesai, tapi tampilan terakhir yang berhasil tetap aman. Kamu bisa cek hasil lama atau lanjut ngobrol dengan AI."
              : "Lihat hasilnya dulu. Kalau ada yang kurang pas, lanjut ngobrol dengan AI."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-spacing-2">
          <Button
            type="button"
            onClick={onPreview}
            className="h-9 rounded-[12px] bg-foreground text-background px-spacing-4 text-xs hover:bg-foreground/90 dark:bg-surface-warm-white dark:text-foreground-primary dark:hover:bg-surface-warm-white/86"
          >
            Lihat website
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onDiscuss}
            className="h-9 rounded-[12px] border-border bg-transparent px-spacing-4 text-xs text-foreground hover:bg-muted dark:border-surface-warm-white/12 dark:text-surface-warm-white/78 dark:hover:bg-surface-warm-white/8"
          >
            Chat dengan AI
          </Button>
        </div>
      </div>
    </div>
  );
}
