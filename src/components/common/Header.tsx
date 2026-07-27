"use client";

import { AuthButton } from "@/components/common/AuthButton";
import { EnergyDisplay } from "@/components/common/EnergyDisplay";
import { Image } from "@/components/ui/image";
import { Link } from "@/components/ui/link";
import { useSession } from "@/lib/auth-client";

export function Header() {
  const { data: session } = useSession();
  const showAdmin = session?.user?.admin === true;
  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.07] bg-[#151515] text-surface-warm-white">
      <div className="mx-auto grid h-14 max-w-7xl grid-cols-[auto_1fr_auto] items-center px-spacing-7 sm:px-spacing-9 lg:px-spacing-10">
        <Link
          href="/"
          className="flex items-center gap-2 justify-self-start whitespace-nowrap rounded-radius-md text-base font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-surface-warm-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#151515] sm:text-lg"
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
          {showAdmin ? (
            <Link
              href="/admin"
              className="rounded-radius-md px-spacing-2 py-spacing-1 text-sm text-surface-warm-white/70 transition hover:text-surface-warm-white"
            >
              Admin
            </Link>
          ) : null}
          <EnergyDisplay />
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
