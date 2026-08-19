import { useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  count: number;
};

// ponytail: collapse by default so admin opening page sees concise settings
export function AdvancedSettingsDisclosure({ children, count }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section>
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-radius-md border border-black/10 bg-[#fcfbf8] p-spacing-3 text-sm text-[#1c1c1c] transition-colors hover:bg-black/[0.02] dark:border-surface-warm-white/12 dark:bg-surface-warm-white/5 dark:text-surface-warm-white dark:hover:bg-surface-warm-white/8"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className="font-medium">
          Konfigurasi lanjutan ({count} pengaturan)
        </span>
        <span
          className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/70"
          aria-hidden="true"
        >
          {open ? "Sembunyikan" : "Tampilkan"}
        </span>
      </button>
      {open ? (
        <div className="mt-spacing-4 flex flex-col gap-spacing-6">
          {children}
        </div>
      ) : null}
    </section>
  );
}
