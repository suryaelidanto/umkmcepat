"use client";

import { AuthButton } from "@/components/common/AuthButton";
import { headerSkin } from "@/components/common/chrome-skin";
import { useChromeSkin } from "@/components/common/ChromeSkinSwitcher";
import { EnergyDisplay } from "@/components/common/EnergyDisplay";
import { Image } from "@/components/ui/image";
import { Link } from "@/components/ui/link";
import { cn } from "@/lib/utils";

export function Header() {
  const skin = headerSkin[useChromeSkin()];

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full text-surface-warm-white",
        skin.bar,
      )}
    >
      <div
        className={cn(
          "mx-auto grid max-w-7xl grid-cols-[auto_1fr_auto] items-center px-spacing-7 sm:px-spacing-9 lg:px-spacing-10",
          skin.row,
        )}
      >
        <Link
          href="/"
          className={cn(
            "flex items-center gap-2 justify-self-start whitespace-nowrap rounded-radius-md text-base font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-surface-warm-white focus-visible:ring-offset-2 sm:text-lg",
            skin.link,
          )}
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
          <EnergyDisplay />
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
