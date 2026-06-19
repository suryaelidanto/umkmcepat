import Link from "next/link";

import { Button } from "@/components/ui/button";

const templates = [
  "Kuliner rumahan",
  "Jasa lokal",
  "Produk handmade",
  "Kelas online",
  "Event kecil",
  "Toko katalog",
];

const steps = [
  {
    title: "Tulis kebutuhan",
    description: "Ceritakan usaha, produk, harga, dan kontak dalam bahasa sehari-hari.",
  },
  {
    title: "Rapikan hasil",
    description: "AI menyusun struktur halaman. Kamu tetap bisa mengubah isi sebelum dibagikan.",
  },
  {
    title: "Bagikan link",
    description: "Pakai halaman untuk bio Instagram, broadcast WhatsApp, atau katalog sederhana.",
  },
];

const marks = ["PostgreSQL", "Prisma", "OpenRouter", "S3 compatible", "NextAuth", "Open source"];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#f7f7f3] text-[#111111]">
      <section className="px-4 pb-12 pt-14 sm:px-6 sm:pb-16 sm:pt-16 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center text-center">
          <h1 className="max-w-5xl text-balance text-[clamp(3.6rem,9.4vw,8.25rem)] font-semibold leading-[0.86] tracking-[-0.075em]">
            Buat landing page UMKM dengan AI
          </h1>
          <p className="mt-6 max-w-2xl text-balance text-lg leading-8 text-black/58 sm:text-xl">
            Ceritakan usahamu. UMKM Cepat menyusun halaman promosi yang rapi, siap diedit, dan mudah dibagikan.
          </p>

          <div className="mt-8 w-full max-w-3xl rounded-[24px] border border-black/12 bg-white p-2 shadow-[0_24px_80px_rgba(0,0,0,0.10)]">
            <div className="rounded-[18px] border border-black/10 bg-[#fbfbf8] p-5 text-left sm:p-6">
              <label htmlFor="hero-prompt" className="sr-only">
                Contoh prompt usaha
              </label>
              <textarea
                id="hero-prompt"
                readOnly
                value="Saya jual sambal rumahan. Buat halaman promosi yang sederhana, hangat, dan punya tombol WhatsApp."
                className="h-24 w-full resize-none bg-transparent text-base leading-7 text-black outline-none sm:text-lg"
                aria-label="Contoh prompt usaha"
              />
              <div className="flex flex-col gap-3 border-t border-black/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm text-black/45">AI siap menyusun struktur halamanmu</span>
                <Button asChild className="h-11 rounded-[14px] bg-[#ff5a3d] px-5 text-white hover:bg-[#e6452d] focus-visible:ring-2 focus-visible:ring-[#ff5a3d] focus-visible:ring-offset-2 focus-visible:ring-offset-white">
                  <Link href="/create">Buat halaman</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Teknologi dan prinsip" className="border-y border-black/10 bg-white/45 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-black/42">
          {marks.map((mark) => (
            <span key={mark}>{mark}</span>
          ))}
        </div>
      </section>

      <section id="templates" className="scroll-mt-24 px-4 py-18 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <h2 className="text-4xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-6xl">
              Mulai dari pola halaman yang sudah familiar.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-black/55">
              Template visual disiapkan sebagai kanvas. Isi dan gaya tetap mengikuti cerita usahamu.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template, index) => (
              <article key={template} className="group overflow-hidden rounded-[24px] border border-black/10 bg-white shadow-[0_16px_50px_rgba(0,0,0,0.06)]">
                <div className="aspect-[4/3] bg-[#ecece5] p-4">
                  <div className="h-full rounded-[16px] border border-black/10 bg-[#f9f9f5] p-4 transition-transform duration-300 group-hover:-translate-y-1">
                    <div className="h-3 w-20 rounded-full bg-black/12" />
                    <div className="mt-5 h-12 rounded-xl bg-black/10" />
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="h-14 rounded-xl bg-black/8" />
                      <div className="h-14 rounded-xl bg-black/8" />
                      <div className="h-14 rounded-xl bg-black/8" />
                    </div>
                    <div className="mt-4 h-8 w-24 rounded-xl bg-[#ff5a3d]/85" />
                  </div>
                </div>
                <div className="flex items-center justify-between p-5">
                  <h3 className="font-medium">{template}</h3>
                  <span className="text-sm text-black/35">0{index + 1}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="cara-kerja" className="scroll-mt-24 px-4 pb-18 sm:px-6 sm:pb-24 lg:px-8">
        <div className="mx-auto max-w-6xl border-t border-black/10 pt-14 sm:pt-20">
          <h2 className="max-w-3xl text-4xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-6xl">
            Bangun halaman tanpa membuka builder rumit.
          </h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {steps.map((step, index) => (
              <article key={step.title} className="border-t border-black/10 pt-5">
                <span className="text-sm text-black/35">0{index + 1}</span>
                <h3 className="mt-6 text-2xl font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-3 text-base leading-7 text-black/55">{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="open-source" className="scroll-mt-24 px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 rounded-[24px] border border-black/10 bg-white p-6 shadow-[0_20px_70px_rgba(0,0,0,0.07)] sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-4xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-5xl">
              Open source, siap dikembangkan.
            </h2>
            <p className="mt-4 text-base leading-7 text-black/55">
              UMKM Cepat memakai boundary provider yang jelas untuk AI, storage, auth, rate limit, dan queue.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild className="h-11 rounded-[14px] bg-[#111111] px-5 text-white hover:bg-[#2a2a2a] focus-visible:ring-2 focus-visible:ring-[#ff5a3d] focus-visible:ring-offset-2 focus-visible:ring-offset-white">
              <Link href="/create">Mulai</Link>
            </Button>
            <Button asChild variant="outline" className="h-11 rounded-[14px] border-black/12 bg-white px-5 text-[#111111] hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-[#ff5a3d] focus-visible:ring-offset-2 focus-visible:ring-offset-white">
              <Link href="https://github.com/suryaelidanto/umkmcepat" target="_blank" rel="noreferrer">
                GitHub
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
