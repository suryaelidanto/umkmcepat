"use client";

import { HeartHandshake, ShieldCheck } from "lucide-react";

import { Image } from "@/components/ui/image";
import { Link } from "@/components/ui/link";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-spacing-12 sm:px-6 sm:py-spacing-13 lg:px-spacing-10 lg:py-spacing-14">
        <div className="grid grid-cols-1 gap-spacing-8 sm:grid-cols-2 md:grid-cols-5 lg:gap-spacing-10">
          <div className="flex flex-col items-start md:col-span-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-radius-lg text-lg font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Image
                src="/brand/umkmcepat-logo.svg"
                alt="Logo UMKM Cepat"
                width={36}
                height={36}
              />
              <span>UMKM Cepat</span>
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Etalase website rapi untuk usahamu, langsung terhubung ke
              WhatsApp. Calon pembeli paham produk dan harga sebelum kirim
              pesan.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-status-success" />
              <span>Dibuat untuk pelaku usaha Indonesia</span>
            </div>
          </div>

          <nav
            aria-label="Navigasi Footer"
            className="grid grid-cols-1 gap-spacing-8 sm:grid-cols-3 md:col-span-3 lg:gap-spacing-10"
          >
            <div className="flex flex-col items-start">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Solusi
              </h4>
              <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
                <li>
                  <Link
                    href="/#buat"
                    className="transition-colors hover:text-foreground"
                  >
                    Buat Website
                  </Link>
                </li>
                <li>
                  <Link
                    href="/#cara-kerja"
                    className="transition-colors hover:text-foreground"
                  >
                    Cara Kerja
                  </Link>
                </li>
                <li>
                  <Link
                    href="/#faq"
                    className="transition-colors hover:text-foreground"
                  >
                    Tanya Jawab (FAQ)
                  </Link>
                </li>
              </ul>
            </div>

            <div className="flex flex-col items-start">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Bantuan
              </h4>
              <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
                <li>
                  <Link
                    href="/support"
                    className="transition-colors hover:text-foreground"
                  >
                    Pusat Bantuan
                  </Link>
                </li>
                <li>
                  <Link
                    href="/sponsor"
                    className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
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
                    className="transition-colors hover:text-foreground"
                  >
                    GitHub
                  </a>
                </li>
              </ul>
            </div>

            <div className="flex flex-col items-start">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Ketentuan
              </h4>
              <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
                <li>
                  <Link
                    href="/terms"
                    className="transition-colors hover:text-foreground"
                  >
                    Ketentuan Layanan
                  </Link>
                </li>
                <li>
                  <Link
                    href="/privacy"
                    className="transition-colors hover:text-foreground"
                  >
                    Kebijakan Privasi
                  </Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-spacing-9 flex flex-col items-center justify-between gap-3 border-t border-border pt-spacing-6 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} UMKM Cepat. Hak cipta dilindungi.</p>
          <p>Tanpa komisi, tanpa koding, tanpa biaya tersembunyi.</p>
        </div>
      </div>
    </footer>
  );
}
