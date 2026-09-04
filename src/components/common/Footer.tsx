"use client";

import { HeartHandshake, ShieldCheck } from "lucide-react";

import { Image } from "@/components/ui/image";
import { Link } from "@/components/ui/link";

export function Footer() {
  return (
    <footer className="border-t border-black/10 bg-[#eceae4] text-[#1c1c1c] dark:border-white/[0.07] dark:bg-[#151515] dark:text-surface-warm-white">
      <div className="mx-auto max-w-7xl px-4 py-spacing-10 sm:px-6 sm:py-spacing-12 lg:px-spacing-10">
        <div className="grid grid-cols-1 gap-spacing-8 sm:grid-cols-2 md:grid-cols-5 lg:gap-spacing-10">
          <div className="flex flex-col items-start md:col-span-2">
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
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#5f5f5d] dark:text-surface-warm-white/60">
              Etalase website rapi untuk usahamu, langsung terhubung ke
              WhatsApp. Calon pembeli paham produk dan harga sebelum kirim
              pesan.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-1 text-xs text-[#5f5f5d] dark:border-white/10 dark:bg-white/[0.04] dark:text-surface-warm-white/70">
              <ShieldCheck className="size-3.5 text-status-success" />
              <span>Dibuat untuk pelaku usaha Indonesia</span>
            </div>
          </div>

          <div className="flex flex-col items-start">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#1c1c1c] dark:text-surface-warm-white">
              Solusi
            </h4>
            <ul className="mt-3 space-y-2.5 text-sm text-[#5f5f5d] dark:text-surface-warm-white/60">
              <li>
                <Link
                  href="/#buat"
                  className="transition-colors hover:text-[#1c1c1c] dark:hover:text-surface-warm-white"
                >
                  Buat Website
                </Link>
              </li>
              <li>
                <Link
                  href="/#cara-kerja"
                  className="transition-colors hover:text-[#1c1c1c] dark:hover:text-surface-warm-white"
                >
                  Cara Kerja
                </Link>
              </li>
              <li>
                <Link
                  href="/#faq"
                  className="transition-colors hover:text-[#1c1c1c] dark:hover:text-surface-warm-white"
                >
                  Tanya Jawab (FAQ)
                </Link>
              </li>
            </ul>
          </div>

          <div className="flex flex-col items-start">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#1c1c1c] dark:text-surface-warm-white">
              Bantuan
            </h4>
            <ul className="mt-3 space-y-2.5 text-sm text-[#5f5f5d] dark:text-surface-warm-white/60">
              <li>
                <Link
                  href="/support"
                  className="transition-colors hover:text-[#1c1c1c] dark:hover:text-surface-warm-white"
                >
                  Pusat Bantuan
                </Link>
              </li>
              <li>
                <Link
                  href="/sponsor"
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-[#1c1c1c] dark:hover:text-surface-warm-white"
                >
                  <HeartHandshake className="size-3.5 text-accent-orange" />
                  <span>Sponsor</span>
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/suryaelidanto/umkmcepat"
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-[#1c1c1c] dark:hover:text-surface-warm-white"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>

          <div className="flex flex-col items-start">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#1c1c1c] dark:text-surface-warm-white">
              Ketentuan
            </h4>
            <ul className="mt-3 space-y-2.5 text-sm text-[#5f5f5d] dark:text-surface-warm-white/60">
              <li>
                <Link
                  href="/terms"
                  className="transition-colors hover:text-[#1c1c1c] dark:hover:text-surface-warm-white"
                >
                  Ketentuan Layanan
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="transition-colors hover:text-[#1c1c1c] dark:hover:text-surface-warm-white"
                >
                  Kebijakan Privasi
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-spacing-9 flex flex-col items-center justify-between gap-3 border-t border-black/10 pt-spacing-6 text-xs text-[#5f5f5d] sm:flex-row dark:border-white/[0.08] dark:text-surface-warm-white/50">
          <p>© {new Date().getFullYear()} UMKM Cepat. Hak cipta dilindungi.</p>
          <p>Tanpa komisi, tanpa koding, tanpa biaya tersembunyi.</p>
        </div>
      </div>
    </footer>
  );
}
