import { Check, X } from "lucide-react";

import { ScrollReveal } from "@/components/home/ScrollReveal";
import { AvatarFrame } from "@/components/ui/avatar-frame";
import { Highlighter } from "@/components/ui/highlighter";

const VALUE_POINTS = [
  {
    number: "01",
    titlePrefix: "2× hingga 3× lebih cepat",
    highlightText: "closing.",
    titleSuffix: "",
    highlightAction: "highlight" as const,
    highlightColor: "rgba(16, 185, 129, 0.25)",
    description:
      "Pembeli masuk ke WhatsApp sudah tahu produk dan harga pasti, bukan baru tanya-tanya.",
  },
  {
    number: "02",
    titlePrefix: "Hemat",
    highlightText: "±10 jam kerja",
    titleSuffix: "setiap minggu.",
    highlightAction: "highlight" as const,
    highlightColor: "rgba(255, 122, 89, 0.25)",
    description:
      "Berhenti ketik ulang menu, cari foto lama di galeri, dan jawab pertanyaan yang sama.",
  },
  {
    number: "03",
    titlePrefix: "Potensi",
    highlightText: "+15% s/d 30%",
    titleSuffix: "nilai pesanan naik.",
    highlightAction: "underline" as const,
    highlightColor: "rgba(16, 185, 129, 0.5)",
    description:
      "Katalog rapi membuat pembeli melihat menu pelengkap dan tergoda pesan ekstra.",
  },
  {
    number: "04",
    titlePrefix: "",
    highlightText: "1 detik langsung terbuka",
    titleSuffix: "di HP pembeli.",
    highlightAction: "highlight" as const,
    highlightColor: "rgba(247, 164, 65, 0.25)",
    description:
      "Sangat ringan walau sinyal pas-pasan, hemat kuota, langsung ke tombol pesan WhatsApp.",
  },
  {
    number: "05",
    titlePrefix: "Langsung dari HP,",
    highlightText: "tanpa perlu laptop.",
    titleSuffix: "",
    highlightAction: "underline" as const,
    highlightColor: "rgba(255, 122, 89, 0.5)",
    description:
      "Ceritakan usahamu lewat chat santai. Website tokomu langsung jadi dan siap dipasang di bio.",
  },
] as const;

export function BeforeAfterSection() {
  return (
    <section
      aria-labelledby="perbandingan-heading"
      className="bg-[#eceae4] px-4 py-spacing-10 text-[#1c1c1c] dark:bg-[#151515] dark:text-surface-warm-white sm:px-spacing-9 sm:py-spacing-12 lg:px-spacing-10 lg:py-spacing-13"
      id="perbandingan"
    >
      <div className="mx-auto max-w-5xl">
        {/* BAGIAN 1: SIDE-BY-SIDE CHAT WHATSAPP */}
        <ScrollReveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="perbandingan-heading"
              className="text-2xl font-semibold tracking-[-0.04em] text-[#1c1c1c] dark:text-surface-warm-white sm:text-3xl lg:text-4xl"
            >
              Beda chat yang masuk ke WhatsApp tokomu
            </h2>
            <p className="mt-2 text-xs text-[#5f5f5d] dark:text-surface-warm-white/65 sm:text-sm">
              Biarkan website yang jelaskan menu dan harga. Kamu fokus terima
              pesanan jadi.
            </p>
          </div>
        </ScrollReveal>

        <div className="mt-spacing-8 grid gap-spacing-5 sm:gap-spacing-6 lg:grid-cols-2">
          {/* KIRI: TANPA WEBSITE */}
          <ScrollReveal>
            <div className="flex h-full flex-col justify-between rounded-2xl border border-red-500/20 bg-white/70 p-4.5 transition-colors dark:border-red-500/25 dark:bg-white/[0.03] sm:p-6">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
                    <X className="size-3.5" />
                    Tanpa Website
                  </span>
                  <span className="text-[11px] text-[#5f5f5d] dark:text-surface-warm-white/40">
                    Bikin capek &amp; lambat
                  </span>
                </div>

                {/* Simulasi Chat Masuk: Tanya-Tanya Doang */}
                <div className="mt-4 rounded-xl border border-black/5 bg-[#ece8de] p-3.5 dark:border-white/5 dark:bg-[#141413]">
                  <div className="flex items-center gap-2.5 border-b border-black/5 pb-2.5 dark:border-white/5">
                    <AvatarFrame
                      seed="Calon Pembeli"
                      className="size-8 rounded-full border border-black/10 dark:border-white/15"
                    />
                    <div>
                      <p className="text-xs font-semibold text-[#1c1c1c] dark:text-surface-warm-white">
                        Calon Pembeli (Baru)
                      </p>
                      <p className="text-[10px] text-[#5f5f5d] dark:text-surface-warm-white/40">
                        online
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-2 text-xs">
                    <div className="max-w-[88%] self-start rounded-xl rounded-tl-xs bg-white p-2.5 shadow-2xs dark:bg-[#20201e] dark:text-surface-warm-white">
                      <p>P... kak pricelistnya mana?</p>
                      <span className="mt-0.5 block text-right text-[9px] text-[#5f5f5d]/60 dark:text-surface-warm-white/40">
                        10:02
                      </span>
                    </div>

                    <div className="max-w-[88%] self-start rounded-xl rounded-tl-xs bg-white p-2.5 shadow-2xs dark:bg-[#20201e] dark:text-surface-warm-white">
                      <p>Menunya apa aja ya? Bisa minta foto aslinya?</p>
                      <span className="mt-0.5 block text-right text-[9px] text-[#5f5f5d]/60 dark:text-surface-warm-white/40">
                        10:03
                      </span>
                    </div>

                    <div className="max-w-[88%] self-start rounded-xl rounded-tl-xs bg-white p-2.5 shadow-2xs dark:bg-[#20201e] dark:text-surface-warm-white">
                      <p>Lokasi toko di mana? Buka jam berapa?</p>
                      <span className="mt-0.5 block text-right text-[9px] text-[#5f5f5d]/60 dark:text-surface-warm-white/40">
                        10:04
                      </span>
                    </div>

                    <div className="self-center pt-1 text-center">
                      <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-[10px] text-red-600 dark:bg-white/5 dark:text-red-400">
                        Kamu harus ketik ulang semuanya dari awal
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-1.5 border-t border-black/5 pt-3 text-xs font-semibold text-red-600 dark:border-white/5 dark:text-red-400">
                <X className="size-4 shrink-0" />
                <span>Waktu habis balas chat dasar, belum tentu beli.</span>
              </div>
            </div>
          </ScrollReveal>

          {/* KANAN: PAKAI UMKM CEPAT */}
          <ScrollReveal>
            <div className="flex h-full flex-col justify-between rounded-2xl border border-emerald-500/25 bg-white/70 p-4.5 transition-colors dark:border-emerald-500/25 dark:bg-white/[0.03] sm:p-6">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3.5" />
                    Pakai UMKM Cepat
                  </span>
                  <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    Tinggal kirim rekening
                  </span>
                </div>

                {/* Simulasi Chat Masuk: Sudah Jadi Order Siap Bayar */}
                <div className="mt-4 rounded-xl border border-emerald-500/20 bg-[#ece8de] p-3.5 dark:border-white/5 dark:bg-[#141413]">
                  <div className="flex items-center gap-2.5 border-b border-black/5 pb-2.5 dark:border-white/5">
                    <AvatarFrame
                      seed="Dina Lestari"
                      className="size-8 rounded-full border border-emerald-500/30 ring-1 ring-emerald-500/20"
                    />
                    <div>
                      <p className="text-xs font-semibold text-[#1c1c1c] dark:text-surface-warm-white">
                        Pembeli dari Website
                      </p>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        klik dari bio Instagram
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-2 text-xs">
                    <div className="max-w-[95%] self-start rounded-xl rounded-tl-xs bg-white p-3 shadow-2xs dark:bg-[#20201e] dark:text-surface-warm-white">
                      <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                        Pesanan Baru via Website:
                      </p>
                      <ul className="mt-1.5 space-y-0.5 text-[#1c1c1c] dark:text-surface-warm-white">
                        <li>• 2x Paket Nasi Kebuli (Rp 76.000)</li>
                        <li>• 1x Es Teh Manis Jumbo (Rp 6.000)</li>
                      </ul>
                      <div className="mt-2 border-t border-black/5 pt-1.5 text-[11px] text-[#5f5f5d] dark:border-white/5 dark:text-surface-warm-white/70">
                        <p>
                          Total: <strong>Rp 82.000</strong>
                        </p>
                        <p>Alamat: Jl. Melati No. 4, Tebet</p>
                        <p className="mt-1 text-emerald-700 dark:text-emerald-400 font-medium">
                          &quot;Bisa bayar via transfer BCA / QRIS kak?&quot;
                        </p>
                      </div>
                      <span className="mt-1 block text-right text-[9px] text-[#5f5f5d]/60 dark:text-surface-warm-white/40">
                        10:02
                      </span>
                    </div>

                    <div className="max-w-[85%] self-end rounded-xl rounded-tr-xs bg-[#dcf8c6] p-2.5 text-[#0f2e14] shadow-2xs dark:bg-[#1a3821] dark:text-[#c7eccd]">
                      <p className="font-medium">
                        Bisa kak! Ini no rek BCA: 123-456-7890. Langsung kami
                        proses ya.
                      </p>
                      <span className="mt-0.5 block text-right text-[9px] text-[#0f2e14]/50 dark:text-[#c7eccd]/50">
                        10:03
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-1.5 border-t border-black/5 pt-3 text-xs font-semibold text-emerald-600 dark:border-white/5 dark:text-emerald-400">
                <Check className="size-4 shrink-0" />
                <span>
                  Pesan masuk sudah rapi. Tinggal kirim rekening &amp; closing.
                </span>
              </div>
            </div>
          </ScrollReveal>
        </div>

        {/* BAGIAN 2: 5 PILAR NILAI BISNIS DENGAN HIGHLIGHTER */}
        <div className="mt-spacing-10 sm:mt-spacing-12 lg:mt-spacing-13">
          <ScrollReveal>
            <div className="mb-spacing-8">
              <p className="font-mono text-xs uppercase tracking-widest text-[#5f5f5d] dark:text-surface-warm-white/50">
                Dampak Nyata untuk Usahamu
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#1c1c1c] dark:text-surface-warm-white sm:text-3xl lg:text-4xl">
                Yang terjadi saat tokomu punya website sendiri:
              </h3>
            </div>
          </ScrollReveal>

          <div className="divide-y divide-black/10 border-t border-b border-black/10 dark:divide-white/10 dark:border-white/10">
            {VALUE_POINTS.map((point) => (
              <div key={point.number} className="py-spacing-7 sm:py-spacing-9">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-baseline sm:gap-spacing-7">
                  <span className="shrink-0 font-mono text-xl font-bold tracking-tight text-[#5f5f5d]/60 dark:text-surface-warm-white/40 sm:text-2xl">
                    {point.number}
                  </span>

                  <div className="flex-1">
                    <h4 className="text-xl font-semibold tracking-tight text-[#1c1c1c] dark:text-surface-warm-white sm:text-2xl lg:text-3xl">
                      {point.titlePrefix ? `${point.titlePrefix} ` : ""}
                      <Highlighter
                        action={point.highlightAction}
                        color={point.highlightColor}
                        strokeWidth={2}
                      >
                        {point.highlightText}
                      </Highlighter>
                      {point.titleSuffix ? ` ${point.titleSuffix}` : ""}
                    </h4>

                    <p className="mt-1.5 text-xs leading-relaxed text-[#5f5f5d] dark:text-surface-warm-white/65 sm:text-sm">
                      {point.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
