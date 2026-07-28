import { useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  count: number;
};

// Collapsed on every load, deliberately not persisted: an admin opening this
// page to flip a feature flag should see a short page.
export function AdvancedSettingsDisclosure({ children, count }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section>
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-3 text-sm text-surface-warm-white"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span>Konfigurasi lanjutan ({count} pengaturan)</span>
        <span aria-hidden="true">{open ? "Sembunyikan" : "Tampilkan"}</span>
      </button>
      {open ? (
        <div className="mt-spacing-4 flex flex-col gap-spacing-6">
          {children}
        </div>
      ) : null}
    </section>
  );
}
