import { ArrowRight, CheckCircle2, Github, Layers, LockKeyhole, MessageSquareText, Sparkles, Store, Wand2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const benefits = [
  {
    icon: Sparkles,
    title: "Tulis singkat, jadi halaman",
    description: "Masukkan cerita usaha, produk, dan kontak. UMKM Cepat menyusun halaman promosi yang jelas.",
  },
  {
    icon: Store,
    title: "Dibuat untuk jualan",
    description: "Susun value proposition, produk unggulan, testimoni, dan CTA WhatsApp dalam satu alur.",
  },
  {
    icon: Layers,
    title: "Siap tumbuh",
    description: "Arsitektur provider-ready untuk AI, storage, rate limit, dan queue tanpa mengunci platform.",
  },
];

const steps = [
  "Ceritakan nama usaha, kategori, dan gaya promosi.",
  "Tambahkan produk, gambar, harga, dan nomor WhatsApp.",
  "Preview halaman, perbaiki copy, lalu bagikan link ke pelanggan.",
];

const proof = [
  "Tanpa setup teknis",
  "Open-source",
  "Provider fleksibel",
];

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#fbfaf8] text-[#171412]">
      <section className="relative px-4 pb-16 pt-20 sm:px-6 sm:pb-24 sm:pt-28 lg:px-8">
        <div className="absolute left-1/2 top-10 h-72 w-72 -translate-x-1/2 rounded-full bg-[#ff6b5f]/25 blur-3xl" />
        <div className="absolute right-[12%] top-36 h-56 w-56 rounded-full bg-[#7c3aed]/15 blur-3xl" />
        <div className="absolute left-[8%] top-60 h-52 w-52 rounded-full bg-[#ffcf7a]/30 blur-3xl" />

        <div className="relative mx-auto flex max-w-6xl flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#171412]/10 bg-white/70 px-4 py-2 text-sm text-[#171412]/70 shadow-sm backdrop-blur-xl">
            <Sparkles className="h-4 w-4 text-[#f0437d]" aria-hidden="true" />
            AI landing page builder untuk UMKM Indonesia
          </div>

          <h1 className="mt-8 max-w-5xl text-balance text-5xl font-semibold tracking-[-0.055em] text-[#171412] sm:text-7xl lg:text-8xl">
            Buat halaman jualan yang terasa siap dipakai.
          </h1>

          <p className="mt-6 max-w-2xl text-pretty text-base leading-8 text-[#171412]/62 sm:text-lg">
            UMKM Cepat membantu pemilik usaha mengubah ide, produk, dan kontak menjadi landing page rapi untuk dibagikan ke pelanggan.
          </p>

          <div className="mt-10 w-full max-w-3xl rounded-[2rem] border border-[#171412]/10 bg-white/80 p-3 shadow-[0_30px_90px_rgba(240,67,125,0.18)] backdrop-blur-xl">
            <div className="rounded-[1.45rem] border border-[#171412]/10 bg-[#fbfaf8] p-4 text-left sm:p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-[#171412]/55">
                <MessageSquareText className="h-4 w-4 text-[#f0437d]" aria-hidden="true" />
                Ceritakan usahamu
              </div>
              <p className="mt-3 text-lg leading-8 text-[#171412] sm:text-xl">
                “Saya jual sambal rumahan, ingin halaman promosi yang hangat, jelas, dan punya tombol WhatsApp.”
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  {proof.map((item) => (
                    <span key={item} className="rounded-full border border-[#171412]/10 bg-white px-3 py-1.5 text-xs font-medium text-[#171412]/60">
                      {item}
                    </span>
                  ))}
                </div>
                <Button asChild size="lg" className="rounded-full bg-[#171412] px-6 text-white hover:bg-[#171412]/90 focus-visible:ring-[#f0437d]">
                  <Link href="/create" aria-label="Mulai membuat landing page UMKM Cepat">
                    Buat Sekarang
                    <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="fitur" className="scroll-mt-24 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-3">
          {benefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <article key={benefit.title} className="rounded-[1.75rem] border border-[#171412]/10 bg-white/70 p-6 shadow-[0_18px_60px_rgba(23,20,18,0.06)] backdrop-blur">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff6b5f] to-[#f0437d] text-white shadow-lg shadow-[#f0437d]/20">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 className="mt-6 text-2xl font-semibold tracking-tight">{benefit.title}</h2>
                <p className="mt-3 text-sm leading-6 text-[#171412]/62">{benefit.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="alur" className="scroll-mt-24 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 rounded-[2rem] border border-[#171412]/10 bg-[#171412] p-6 text-white shadow-[0_30px_90px_rgba(23,20,18,0.16)] sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:p-10">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/70">
              <Wand2 className="h-4 w-4 text-[#ffcf7a]" aria-hidden="true" />
              Alur sederhana
            </div>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Dari cerita usaha ke halaman promosi.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-white/62">
              Fokus ke pesan dan produk. UMKM Cepat bantu struktur halaman agar mudah dipahami calon pelanggan.
            </p>
          </div>

          <ol className="space-y-3">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-4 rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-[#171412]">
                  {index + 1}
                </span>
                <p className="pt-1 text-base leading-7 text-white/75">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="open-source" className="scroll-mt-24 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl rounded-[2rem] border border-[#171412]/10 bg-white/75 p-6 shadow-[0_20px_80px_rgba(23,20,18,0.08)] backdrop-blur sm:p-8 lg:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#171412]/10 px-3 py-2 text-sm text-[#171412]/65">
                <LockKeyhole className="h-4 w-4 text-[#f0437d]" aria-hidden="true" />
                Open-source, bukan kotak hitam
              </div>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                Dibangun fleksibel untuk provider hari ini dan nanti.
              </h2>
              <p className="mt-4 text-base leading-7 text-[#171412]/62">
                PostgreSQL, Prisma, OpenRouter, local/S3-compatible storage, dan boundary provider jelas. Cocok untuk belajar, self-host, atau dikembangkan lebih jauh.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <Button asChild size="lg" className="rounded-full bg-[#171412] px-6 text-white hover:bg-[#171412]/90 focus-visible:ring-[#f0437d]">
                <Link href="/create">
                  Mulai Sekarang
                  <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-full border-[#171412]/10 bg-white px-6 text-[#171412] hover:bg-[#171412]/5 focus-visible:ring-[#f0437d]">
                <Link href="https://github.com/suryaelidanto/umkmcepat" target="_blank" rel="noreferrer">
                  <Github className="mr-2 h-5 w-5" aria-hidden="true" />
                  GitHub
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-3 text-sm text-[#171412]/60">
          {proof.map((item) => (
            <div key={item} className="inline-flex items-center gap-2 rounded-full border border-[#171412]/10 bg-white/60 px-4 py-2">
              <CheckCircle2 className="h-4 w-4 text-[#f0437d]" aria-hidden="true" />
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
