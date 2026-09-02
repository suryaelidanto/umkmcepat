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
const EMAIL_SUBJECT = "Sponsorship UMKM Cepat - [Nama Brand]";
const EMAIL_BODY_TEMPLATE = `Halo Tim UMKM Cepat,

Kami tertarik menjadi sponsor.

- Nama Brand: 
- Website / Medsos: 
- Kontak PIC: 
- Rencana Dukungan: [Logo Beranda / Banner Iklan / Promo Komunitas / Lainnya]

Mohon info langkah selanjutnya. Terima kasih.`;

const benefits = [
  {
    icon: Sparkles,
    title: "Logo di Beranda",
    desc: "Tampil di section 'Didukung oleh' pada halaman utama.",
  },
  {
    icon: Megaphone,
    title: "Banner di Dashboard",
    desc: "Promosi produk Anda ke pengguna aktif free tier.",
  },
  {
    icon: Users,
    title: "Akses Komunitas",
    desc: "Bagikan voucher atau promo ke grup WhatsApp UMKM.",
  },
];

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
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link
            href="/"
            className="text-xs text-[#5f5f5d] transition hover:text-[#1c1c1c] dark:text-surface-warm-white/60 dark:hover:text-surface-warm-white"
          >
            ← Kembali ke Beranda
          </Link>
        </div>

        <div className="space-y-1.5 text-left">
          <h1 className="text-2xl font-bold tracking-tight text-[#1c1c1c] dark:text-surface-warm-white sm:text-3xl">
            Sponsori UMKM Cepat
          </h1>
          <p className="text-sm text-[#5f5f5d] dark:text-surface-warm-white/70">
            Jangkau langsung pemilik toko dan usaha aktif di Indonesia.
          </p>
        </div>

        {/* 3 Top Benefits - Concise & Punchy */}
        <div className="grid gap-3 sm:grid-cols-3">
          {benefits.map((b) => (
            <div
              key={b.title}
              className="rounded-xl border border-black/10 bg-white p-4 text-left dark:border-white/10 dark:bg-[#1c1c1a]"
            >
              <div className="flex size-7 items-center justify-center rounded-lg bg-orange-500/10 text-accent-orange dark:bg-orange-400/15">
                <b.icon className="size-4" />
              </div>
              <h2 className="mt-2.5 text-sm font-semibold text-[#1c1c1c] dark:text-surface-warm-white">
                {b.title}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-[#5f5f5d] dark:text-surface-warm-white/70">
                {b.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Email Template Box */}
        <div className="rounded-2xl border border-black/10 bg-white p-5 text-left dark:border-white/10 dark:bg-[#1c1c1a] sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[#1c1c1c] dark:text-surface-warm-white sm:text-base">
                Kirim Pengajuan
              </h2>
              <p className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
                Salin format ini atau buka email langsung.
              </p>
            </div>

            <button
              onClick={handleCopy}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-black/[0.03] px-3 py-1.5 text-xs font-medium text-[#1c1c1c] transition hover:bg-black/[0.08] active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-surface-warm-white dark:hover:bg-white/[0.12]"
            >
              {copied ? (
                <>
                  <Check className="size-3 text-status-success" />
                  <span>Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="size-3" />
                  <span>Salin Format</span>
                </>
              )}
            </button>
          </div>

          <div className="mt-3.5 rounded-xl border border-black/5 bg-[#fcfbf8] p-3.5 font-mono text-xs text-[#1c1c1c] dark:border-white/5 dark:bg-[#141413] dark:text-surface-warm-white/90">
            <div className="mb-2 font-sans font-semibold text-[#5f5f5d] dark:text-surface-warm-white/60">
              Subjek: {EMAIL_SUBJECT}
            </div>
            <pre className="whitespace-pre-wrap font-sans text-xs">
              {EMAIL_BODY_TEMPLATE}
            </pre>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a
              href={mailtoUrl}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent-orange px-5 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.98]"
            >
              <Mail className="size-4" />
              <span>Buka Email &amp; Kirim</span>
            </a>

            <span className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
              atau kirim ke{" "}
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
