import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, HeartHandshake, Mail, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Link } from "@/components/ui/link";
import { DarkPage } from "@/components/ui/surface";

export const Route = createFileRoute("/_main/sponsor")({
  component: SponsorPage,
});

const SPONSOR_EMAIL = "sponsor@umkmcepat.com";
const EMAIL_SUBJECT =
  "Pengajuan Sponsorship UMKM Cepat — [Nama Brand / Perusahaan]";
const EMAIL_BODY_TEMPLATE = `Halo Tim UMKM Cepat,

Kami tertarik untuk mendukung inisiatif UMKM Cepat sebagai sponsor.

- Nama Brand / Perusahaan: [Nama Brand]
- Website / Akun Medsos: [URL Website atau Medsos]
- PIC / Kontak WhatsApp: [Nama & Nomor HP]
- Bentuk Dukungan:
  [ ] Dana Operasional / Monetary (Pilihan Utama)
  [ ] Server / Cloud / Layanan Pendukung
- Perkiraan Nominal / Rencana: [Misal: Rp X.000.000 / bulan atau 1x dukungan]
- Harapan / Pesan Singkat: [Catatan Anda]

Mohon informasi lebih lanjut terkait langkah berikutnya. Terima kasih!`;

function SponsorPage() {
  const [copied, setCopied] = useState(false);

  const mailtoUrl = `mailto:${SPONSOR_EMAIL}?subject=${encodeURIComponent(
    EMAIL_SUBJECT,
  )}&body=${encodeURIComponent(EMAIL_BODY_TEMPLATE)}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(EMAIL_BODY_TEMPLATE);
      setCopied(true);
      toast.success("Format email berhasil disalin!");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Gagal menyalin format email.");
    }
  }

  return (
    <DarkPage className="px-4 py-spacing-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        {/* Breadcrumb / Back */}
        <div className="mb-6">
          <Link
            href="/"
            className="text-xs text-[#5f5f5d] transition hover:text-[#1c1c1c] dark:text-surface-warm-white/60 dark:hover:text-surface-warm-white"
          >
            ← Kembali ke Beranda
          </Link>
        </div>

        {/* Hero */}
        <div className="space-y-4 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/25 bg-orange-500/10 px-3.5 py-1 text-xs font-semibold text-orange-600 dark:border-orange-400/30 dark:bg-orange-400/15 dark:text-orange-300">
            <HeartHandshake className="size-4" />
            <span>Kemitraan &amp; Sponsorship</span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-[#1c1c1c] dark:text-surface-warm-white sm:text-4xl">
            Dukung Digitalisasi UMKM Indonesia
          </h1>

          <p className="text-base leading-relaxed text-[#5f5f5d] dark:text-surface-warm-white/75 sm:text-lg">
            UMKM Cepat dibuat agar ribuan pemilik usaha lokal bisa memiliki
            landing page instan dengan tombol pesan WhatsApp secara 100% gratis.
            Dukungan sponsorship Anda menjaga server, kuota AI, dan operasional
            kami tetap dapat diakses bebas biaya.
          </p>
        </div>

        {/* Benefit Sponsor Cards */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#1c1c1a]">
            <div className="flex size-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:bg-orange-400/15 dark:text-orange-300">
              <Sparkles className="size-5" />
            </div>
            <h3 className="mt-4 font-semibold text-[#1c1c1c] dark:text-surface-warm-white">
              Brand Exposure di Halaman Utama
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5f5f5d] dark:text-surface-warm-white/70">
              Logo dan nama brand Anda ditampilkan secara terhormat di bagian
              &ldquo;Didukung oleh&rdquo; pada beranda UMKM Cepat yang
              dikunjungi ribuan pemilik usaha.
            </p>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#1c1c1a]">
            <div className="flex size-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:bg-orange-400/15 dark:text-orange-300">
              <HeartHandshake className="size-5" />
            </div>
            <h3 className="mt-4 font-semibold text-[#1c1c1c] dark:text-surface-warm-white">
              Dampak Nyata &amp; Nilai Sosial
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5f5f5d] dark:text-surface-warm-white/70">
              Menjadi bagian langsung dari kisah sukses UMKM di berbagai daerah
              yang terbantu go-digital dan meningkatkan omzet lewat WhatsApp.
            </p>
          </div>
        </div>

        {/* Template Format Section */}
        <div className="mt-10 rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#1c1c1a] sm:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#1c1c1c] dark:text-surface-warm-white">
                Format Pengajuan Sponsorship
              </h2>
              <p className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
                Salin format di bawah dan kirimkan ke email kami.
              </p>
            </div>

            <button
              onClick={handleCopy}
              type="button"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-black/[0.03] px-4 py-2 text-xs font-semibold text-[#1c1c1c] transition hover:bg-black/[0.07] active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-surface-warm-white dark:hover:bg-white/[0.12]"
            >
              {copied ? (
                <>
                  <Check className="size-3.5 text-status-success" />
                  <span>Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  <span>Salin Format Email</span>
                </>
              )}
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-black/5 bg-[#fcfbf8] p-4 text-xs font-mono leading-relaxed text-[#1c1c1c] dark:border-white/5 dark:bg-[#141413] dark:text-surface-warm-white/90">
            <div className="mb-2 font-semibold text-[#5f5f5d] dark:text-surface-warm-white/60">
              Subjek: {EMAIL_SUBJECT}
            </div>
            <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm">
              {EMAIL_BODY_TEMPLATE}
            </pre>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href={mailtoUrl}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent-orange px-6 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 active:scale-[0.98]"
            >
              <Mail className="size-4" />
              <span>Buka Email &amp; Kirim Sekarang</span>
            </a>

            <span className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
              atau kirim manual ke{" "}
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
