import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Link } from "@/components/ui/link";
import { DarkPage } from "@/components/ui/surface";

export const Route = createFileRoute("/_main/sponsor")({
  component: SponsorPage,
});

const SPONSOR_EMAIL = "sponsor@umkmcepat.com";
const EMAIL_SUBJECT = "Sponsorship UMKM Cepat - [Nama Perusahaan]";
const EMAIL_BODY_TEMPLATE = `Halo Tim UMKM Cepat,

Kami ingin mengajukan sponsorship untuk mendukung operasional UMKM Cepat.

- Nama Brand / Perusahaan: 
- Website / Media Sosial: 
- Kontak PIC (Nama & WhatsApp): 
- Bentuk Dukungan: [Dana Operasional / Layanan Server / Lainnya]
- Nominal atau Rencana Dukungan: 
- Catatan Tambahan: 

Mohon informasi langkah selanjutnya. Terima kasih.`;

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

        <div className="space-y-3 text-left">
          <h1 className="text-2xl font-bold tracking-tight text-[#1c1c1c] dark:text-surface-warm-white sm:text-3xl">
            Sponsorship UMKM Cepat
          </h1>
          <p className="text-sm leading-relaxed text-[#5f5f5d] dark:text-surface-warm-white/70 sm:text-base">
            UMKM Cepat menyediakan landing page instan dengan tombol WhatsApp
            gratis untuk pemilik usaha kecil. Dukungan sponsorship dipakai
            langsung untuk biaya server dan kuota AI.
          </p>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-[#1c1c1a]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#1c1c1c] dark:text-surface-warm-white">
                Format Email Sponsorship
              </h2>
              <p className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
                Salin format ini lalu kirim ke email kami.
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
