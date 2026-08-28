"use client";

import { Image } from "@/components/ui/image";
import { Link } from "@/components/ui/link";

export function Footer() {
  return (
    <footer className="border-t border-black/10 bg-[#eceae4] text-[#1c1c1c] dark:border-white/[0.07] dark:bg-[#151515] dark:text-surface-warm-white">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-spacing-7 px-4 py-spacing-9 text-center sm:px-6 sm:text-left lg:px-spacing-10">
        <div className="flex w-full flex-col items-center gap-spacing-9 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col items-center md:items-start">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-radius-lg text-lg font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-[#1c1c1c] dark:focus-visible:ring-surface-warm-white"
            >
              <Image
                src="/brand/umkmcepat-logo.svg"
                alt="Logo UMKM Cepat"
                width={36}
                height={36}
              />
              <span>UMKM Cepat</span>
            </Link>
            <p className="mt-2 max-w-md text-sm leading-6 text-[#5f5f5d] dark:text-surface-warm-white/50">
              Bikin website usaha dan promosi instan tanpa koding, siap jualan
              dalam hitungan menit.
            </p>
          </div>

          <nav className="flex flex-wrap justify-center gap-spacing-5 text-sm md:justify-start">
            <Link
              href="/terms"
              className="text-[#5f5f5d] outline-none transition-colors hover:text-[#1c1c1c] dark:text-surface-warm-white/50 dark:hover:text-surface-warm-white"
            >
              Ketentuan
            </Link>
            <Link
              href="/privacy"
              className="text-[#5f5f5d] outline-none transition-colors hover:text-[#1c1c1c] dark:text-surface-warm-white/50 dark:hover:text-surface-warm-white"
            >
              Privasi
            </Link>
          </nav>
        </div>

        <p className="w-full text-center text-sm text-[#5f5f5d] dark:text-surface-warm-white/60 sm:text-left">
          © {new Date().getFullYear()} UMKM Cepat
        </p>
      </div>
    </footer>
  );
}
