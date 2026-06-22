import Image from "next/image";
import Link from "next/link";

import { AuthButton } from "@/components/common/AuthButton";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-surface-warm-white/10 bg-[#151515]/82 text-surface-warm-white backdrop-blur-xl">
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[auto_1fr_auto] items-center px-spacing-7 sm:px-spacing-9 lg:px-spacing-10">
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

        <div className="flex items-center justify-end gap-2">
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
