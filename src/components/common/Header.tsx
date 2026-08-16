"use client";

import { AuthButton } from "@/components/common/AuthButton";
import { EnergyDisplay } from "@/components/common/EnergyDisplay";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { Image } from "@/components/ui/image";
import { Link } from "@/components/ui/link";
import { useSession } from "@/lib/auth-client";

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
    <header className="sticky top-0 z-50 w-full border-b border-black/10 bg-[#eceae4]/90 text-[#1c1c1c] backdrop-blur-md transition-colors duration-200 dark:border-white/[0.07] dark:bg-[#151515] dark:text-surface-warm-white">
      {showDevBanner ? (
        <div className="border-b border-aurora-orange/30 bg-aurora-orange/10 px-spacing-4 py-1 text-aurora-orange">
          <div className="mx-auto flex max-w-7xl items-center justify-center gap-spacing-3 text-[10px]">
            <span>DEV: Mode Pengembang</span>
            {showResetButton ? (
              <button
                className="rounded-radius-sm border border-aurora-orange/40 px-1.5 py-px text-[9px] font-semibold transition hover:bg-aurora-orange/20 disabled:opacity-50"
                disabled={devResetPending}
                onClick={onDevReset}
                type="button"
              >
                {devResetPending ? "Mereset..." : "Reset Antrian"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="mx-auto grid h-14 max-w-7xl grid-cols-[auto_1fr_auto] items-center px-spacing-7 sm:px-spacing-9 lg:px-spacing-10">
        <Link
          href="/"
          className="flex items-center gap-2 justify-self-start whitespace-nowrap rounded-radius-md text-base font-semibold tracking-tight text-[#1c1c1c] outline-none dark:text-surface-warm-white sm:text-lg"
          aria-label="UMKM Cepat beranda"
        >
          <Image
            src="/brand/umkmcepat-logo.svg"
            alt="Logo UMKM Cepat"
            width={32}
            height={32}
            priority
          />
          <span>UMKM Cepat</span>
        </Link>

        <div aria-hidden="true" />

        <div className="flex items-center justify-end gap-3">
          <ThemeToggle />
          <EnergyDisplay />
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
