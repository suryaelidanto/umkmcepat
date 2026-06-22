import Image from "next/image";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-surface-warm-white/10 bg-[#151515] text-surface-warm-white">
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
            <p className="mt-2 max-w-md text-sm leading-6 text-surface-warm-white/62">
              Buat website promosi untuk usaha kecil dengan bantuan AI.
            </p>
          </div>

          <Link
            href="https://github.com/suryaelidanto/umkmcepat"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-surface-warm-white/62 outline-none transition-colors hover:text-surface-warm-white focus-visible:text-surface-warm-white"
          >
            Github
          </Link>
        </div>

        <p className="text-sm text-surface-warm-white/50">
          © {new Date().getFullYear()} UMKM Cepat
        </p>
      </div>
    </footer>
  );
}
