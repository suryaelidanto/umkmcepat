"use client";

import { footerSkin } from "@/components/common/chrome-skin";
import { useChromeSkin } from "@/components/common/ChromeSkinSwitcher";
import { Image } from "@/components/ui/image";
import { Link } from "@/components/ui/link";
import { cn } from "@/lib/utils";

export function Footer() {
  const skin = footerSkin[useChromeSkin()];

  return (
    <footer className={cn("text-surface-warm-white", skin.bar)}>
      <div className="mx-auto flex max-w-7xl flex-col gap-spacing-7 px-4 py-spacing-9 sm:px-6 lg:px-spacing-10">
        <div className="flex flex-col gap-spacing-9 md:flex-row md:items-center md:justify-between">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-radius-lg text-lg font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-surface-warm-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#151515]"
            >
              <Image
                src="/brand/umkmcepat-logo.svg"
                alt="Logo UMKM Cepat"
                width={36}
                height={36}
              />
              <span>UMKM Cepat</span>
            </Link>
            <p className={cn("mt-2 max-w-md text-sm leading-6", skin.muted)}>
              Buat website dan alat digital untuk usaha kecil dengan bantuan AI.
            </p>
          </div>

          <nav className="flex flex-wrap gap-spacing-5 text-sm">
            <Link
              href="/terms"
              className={cn("outline-none transition-colors", skin.link)}
            >
              Ketentuan
            </Link>
            <Link
              href="/privacy"
              className={cn("outline-none transition-colors", skin.link)}
            >
              Privasi
            </Link>
            <Link
              href="https://github.com/suryaelidanto/umkmcepat"
              target="_blank"
              rel="noopener noreferrer"
              className={cn("outline-none transition-colors", skin.link)}
            >
              Github
            </Link>
          </nav>
        </div>

        <p className={cn("text-sm", skin.muted, "opacity-80")}>
          © {new Date().getFullYear()} UMKM Cepat
        </p>
      </div>
    </footer>
  );
}
