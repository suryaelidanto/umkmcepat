import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Mail, Megaphone, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Link } from "@/components/ui/link";
import { DarkPage } from "@/components/ui/surface";

export const Route = createFileRoute("/_main/sponsor")({
  component: SponsorPage,
});

const SPONSOR_EMAIL = "sponsor@umkmcepat.com";
const EMAIL_SUBJECT = "Sponsorship UMKM Cepat - [Nama Brand / Perusahaan]";
const EMAIL_BODY_TEMPLATE = `Halo Tim UMKM Cepat,

Kami tertarik untuk menjadi sponsor di platform UMKM Cepat.

- Nama Brand / Perusahaan: 
- Website / Media Sosial: 
- Kontak PIC (Nama & WhatsApp): 
- Bentuk Ketertarikan: [Penempatan Logo / Slot Iklan / Promo Komunitas / Lainnya]
- Rencana Dukungan / Anggaran: 
- Catatan Tambahan: 

Mohon informasi terkait penempatan dan langkah selanjutnya. Terima kasih.`;

function SponsorPage() {
  const [copied, setCopied] = useState(false);

  const mailtoUrl = `mailto:${SPONSOR_EMAIL}?subject=${encodeURIComponent(
    EMAIL_SUBJECT,
  )}&body=${encodeURIComponent(EMAIL_BODY_TEMPLATE)}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(EMAIL_BODY_TEMPLATE);
      setCopied(true);
      toast.success("Format email tersalin.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Gagal menyalin format email.");
    }
  }

  return (
    <DarkPage className="px-4 py-spacing-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <Link
            href="/"
            className="text-xs text-[#5f5f5d] transition hover:text-[#1c1c1c] dark:text-surface-warm-white/60 dark:hover:text-surface-warm-white"
          >
            ← Kembali ke Beranda
          </Link>
        </div>

        <div className="space-y-2 text-left">
          <h1 className="text-2xl font-bold tracking-tight text-[#1c1c1c] dark:text-surface-warm-white sm:text-3xl">
            Sponsorship UMKM Cepat
          </h1>
          <p className="text-sm leading-relaxed text-[#5f5f5d] dark:text-surface-warm-white/70 sm:text-base">
            Kenalkan brand dan produk Anda langsung ke ribuan pemilik usaha
            aktif di Indonesia.
          </p>
        </div>

        {/* 3 Main Benefits for Sponsor */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-black/10 bg-white p-4.5 dark:border-white/10 dark:bg-[#1c1c1a]">
            <div className="flex size-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:bg-orange-400/15 dark:text-orange-300">
              <Sparkles className="size-4" />
            </div>
            <h2 className="mt-3 text-sm font-semibold text-[#1c1c1c] dark:text-surface-warm-white">
              Logo di Beranda Utama
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#5f5f5d] dark:text-surface-warm-white/70">
              Nama dan tautan bisnis Anda tampil permanen di section
              &ldquo;Didukung oleh&rdquo; pada beranda utama.
            </p>
          </div>

          <div className="rounded-xl border border-black/10 bg-white p-4.5 dark:border-white/10 dark:bg-[#1c1c1a]">
            <div className="flex size-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:bg-orange-400/15 dark:text-orange-300">
              <Megaphone className="size-4" />
            </div>
            <h2 className="mt-3 text-sm font-semibold text-[#1c1c1c] dark:text-surface-warm-white">
              Slot Iklan Pengguna Gratis
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#5f5f5d] dark:text-surface-warm-white/70">
              Banner promosi layanan Anda menjangkau langsung pemilik toko yang
              sedang aktif membuat dan mengedit landing page.
            </p>
          </div>

          <div className="rounded-xl border border-black/10 bg-white p-4.5 dark:border-white/10 dark:bg-[#1c1c1a]">
            <div className="flex size-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:bg-orange-400/15 dark:text-orange-300">
              <Users className="size-4" />
            </div>
            <h2 className="mt-3 text-sm font-semibold text-[#1c1c1c] dark:text-surface-warm-white">
              Akses Promosi Komunitas
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#5f5f5d] dark:text-surface-warm-white/70">
              Peluang membagikan penawaran khusus atau voucher langsung ke grup
              komunitas WhatsApp pemilik bisnis.
            </p>
          </div>
        </div>

        {/* Action & Template */}
        <div className="rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-[#1c1c1a]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#1c1c1c] dark:text-surface-warm-white">
                Format Email Pengajuan
              </h2>
              <p className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
                Salin format ini lalu kirimkan ke tim kami.
              </p>
            </div>

            <button
              onClick={handleCopy}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-black/[0.03] px-3.5 py-1.5 text-xs font-medium text-[#1c1c1c] transition hover:bg-black/[0.08] active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-surface-warm-white dark:hover:bg-white/[0.12]"
            >
              {copied ? (
                <>
                  <Check className="size-3.5 text-status-success" />
                  <span>Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  <span>Salin Format</span>
                </>
              )}
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-black/5 bg-[#fcfbf8] p-4 font-mono text-xs leading-relaxed text-[#1c1c1c] dark:border-white/5 dark:bg-[#141413] dark:text-surface-warm-white/90">
            <div className="mb-2 font-sans font-semibold text-[#5f5f5d] dark:text-surface-warm-white/60">
              Subjek: {EMAIL_SUBJECT}
            </div>
            <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm">
              {EMAIL_BODY_TEMPLATE}
            </pre>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href={mailtoUrl}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent-orange px-5 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.98]"
            >
              <Mail className="size-4" />
              <span>Buka Email &amp; Kirim</span>
            </a>

            <span className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
              atau kirim langsung ke{" "}
              <a
                href={`mailto:${SPONSOR_EMAIL}`}
                className="font-medium underline hover:text-accent-orange"
              >
                {SPONSOR_EMAIL}
              </a>
            </span>
          </div>
        </div>
      </div>
    </DarkPage>
  );
}
