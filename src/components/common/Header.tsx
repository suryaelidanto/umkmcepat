"use client";

import { AuthButton } from "@/components/common/AuthButton";
import { EnergyDisplay } from "@/components/common/EnergyDisplay";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { Image } from "@/components/ui/image";
import { Link } from "@/components/ui/link";
import { useSession } from "@/lib/auth/auth-client";

export function Header() {
  const { data: session } = useSession();
  void session;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 text-foreground backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex min-w-0 shrink items-center gap-2 rounded-radius-md text-base font-semibold tracking-tight text-foreground outline-none sm:text-lg"
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
