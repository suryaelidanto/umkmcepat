"use client";

import { AuthButton } from "@/components/common/AuthButton";
import { EnergyDisplay } from "@/components/common/EnergyDisplay";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { Image } from "@/components/ui/image";
import { Link } from "@/components/ui/link";
import { useSession } from "@/lib/auth/auth-client";

export function Header({
  devResetPending = false,
  onDevReset,
  showDevBanner = false,
  showResetButton = false,
}: {
  devResetPending?: boolean;
  onDevReset?: () => void;
  showDevBanner?: boolean;
  showResetButton?: boolean;
} = {}) {
  const { data: session } = useSession();
  void session;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-black/10 bg-[#eceae4]/90 text-[#1c1c1c] backdrop-blur-md dark:border-white/[0.07] dark:bg-[#151515] dark:text-surface-warm-white">
      {showDevBanner ? (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full border border-accent-orange-border bg-[#eceae4]/95 px-3 py-1.5 text-[11px] font-medium text-accent-orange shadow-lg backdrop-blur-md dark:bg-[#151515]/95">
          <span>DEV: Mode Pengembang</span>
          {showResetButton ? (
            <button
              className="rounded-full border border-accent-orange-border px-2 py-0.5 text-[10px] font-semibold transition hover:bg-accent-orange-subtle disabled:opacity-50"
              disabled={devResetPending}
              onClick={onDevReset}
              type="button"
            >
              {devResetPending ? "Mereset..." : "Reset Antrian"}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex min-w-0 shrink items-center gap-2 rounded-radius-md text-base font-semibold tracking-tight text-[#1c1c1c] outline-none dark:text-surface-warm-white sm:text-lg"
          aria-label="UMKM Cepat beranda"
        >
          <Image
            src="/brand/umkmcepat-logo.svg"
            alt="Logo UMKM Cepat"
            width={28}
            height={28}
            priority
            className="shrink-0 sm:size-8"
          />
          <span className="truncate">UMKM Cepat</span>
        </Link>

        <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-3">
          <div className="hidden sm:flex sm:items-center sm:gap-3">
            <EnergyDisplay />
            <ThemeToggle />
          </div>
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
