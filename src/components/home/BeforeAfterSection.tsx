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
      className="bg-background px-4 py-spacing-12 text-foreground sm:px-spacing-9 sm:py-spacing-13 lg:px-spacing-10 lg:py-spacing-14"
      id="perbandingan"
    >
      <div className="mx-auto max-w-5xl">
        {/* BAGIAN 1: SIDE-BY-SIDE CHAT WHATSAPP */}
        <ScrollReveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="perbandingan-heading"
              className="text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-3xl lg:text-4xl"
            >
              Beda chat yang masuk ke WhatsApp tokomu
            </h2>
            <p className="mt-2 text-xs text-muted-foreground sm:text-sm">
              Biarkan website yang jelaskan menu dan harga. Kamu fokus terima
              pesanan jadi.
            </p>
          </div>
        </ScrollReveal>

        <div className="mt-spacing-8 grid gap-spacing-5 sm:gap-spacing-6 lg:grid-cols-2">
          {/* KIRI: TANPA WEBSITE */}
          <ScrollReveal delay={0.08}>
            <div className="flex h-full flex-col justify-between rounded-2xl border border-destructive/20 bg-card p-4.5 shadow-2xs transition-colors sm:p-6">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive">
                    <X className="size-3.5" />
                    Tanpa Website
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Bikin capek &amp; lambat
                  </span>
                </div>

                {/* Simulasi Chat Masuk: Tanya-Tanya Doang */}
                <div className="mt-4 rounded-xl border border-border bg-muted/50 p-3.5">
                  <div className="flex items-center gap-2.5 border-b border-border pb-2.5">
                    <AvatarFrame
                      seed="Calon Pembeli"
                      className="size-8 rounded-full border border-border"
                    />
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Calon Pembeli (Baru)
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        online
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    <div className="max-w-[85%] rounded-lg rounded-tl-none bg-background p-2.5 shadow-2xs">
                      <p className="text-xs text-foreground">
                        Halo kak, mau tanya menunya apa aja ya?
                      </p>
                      <span className="mt-1 block text-right text-[9px] text-muted-foreground">
                        09.12
                      </span>
                    </div>

                    <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-emerald-100 p-2.5 shadow-2xs dark:bg-emerald-950/60">
                      <p className="text-xs text-foreground">
                        Halo, ada ayam geprek, lele terbang, bebek rempah kak.
                      </p>
                      <span className="mt-1 block text-right text-[9px] text-muted-foreground">
                        09.15
                      </span>
                    </div>

                    <div className="max-w-[85%] rounded-lg rounded-tl-none bg-background p-2.5 shadow-2xs">
                      <p className="text-xs text-foreground">
                        Harganya berapaan ya? Sambelnya pedes banget nggak? Ada
                        level berapa aja?
                      </p>
                      <span className="mt-1 block text-right text-[9px] text-muted-foreground">
                        09.18
                      </span>
                    </div>

                    <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-emerald-100 p-2.5 shadow-2xs dark:bg-emerald-950/60">
                      <p className="text-xs text-foreground">
                        Ayam 18rb, lele 15rb, bebek 28rb kak. Level 1-5 ada kak.
                      </p>
                      <span className="mt-1 block text-right text-[9px] text-muted-foreground">
                        09.22
                      </span>
                    </div>

                    <div className="max-w-[85%] rounded-lg rounded-tl-none bg-background p-2.5 shadow-2xs">
                      <p className="text-xs text-foreground">
                        Oke makasih infonya ya kak, saya pikir-pikir dulu 🙏
                      </p>
                      <span className="mt-1 block text-right text-[9px] text-muted-foreground">
                        09.26
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-red-500/15 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-300">
                <p className="font-medium">
                  Habis waktu 15 menit cuma buat kirim foto menu &amp; list
                  harga. Akhirnya pembeli malah hilang.
                </p>
              </div>
            </div>
          </ScrollReveal>

          {/* KANAN: PAKAI UMKM CEPAT */}
          <ScrollReveal delay={0.2}>
            <div className="flex h-full flex-col justify-between rounded-2xl border border-emerald-500/30 bg-card p-4.5 shadow-2xs transition-colors sm:p-6">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3.5" />
                    Pakai UMKM Cepat
                  </span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                    Langsung siap transfer
                  </span>
                </div>

                {/* Simulasi Chat Masuk: Format Order Lengkap */}
                <div className="mt-4 rounded-xl border border-border bg-muted/50 p-3.5">
                  <div className="flex items-center gap-2.5 border-b border-border pb-2.5">
                    <AvatarFrame
                      seed="Dina Lestari"
                      className="size-8 rounded-full border border-emerald-500/40 ring-1 ring-emerald-500/30"
                    />
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Dina Lestari (Pelanggan)
                      </p>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                        pesanan dari website
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    <div className="max-w-[92%] rounded-lg rounded-tl-none bg-background p-3 shadow-2xs">
                      <p className="text-xs font-medium text-foreground">
                        Halo kak! Saya sudah pilih pesanan dari website:
                      </p>
                      <div className="mt-2 rounded border border-border bg-muted/30 p-2 font-mono text-[11px] leading-relaxed text-foreground">
                        • 2x Ayam Geprek Sambal Korek (Lv 3)
                        <br />
                        • 1x Bebek Rempah Sambal Ijo
                        <br />
                        • 3x Es Teh Manis
                        <br />
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          Total: Rp 76.000
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-foreground">
                        Bisa minta nomor rekening untuk transfer ya kak? Mau
                        dikirim jam 12.00 ke Jl. Melati No. 14 🙏
                      </p>
                      <span className="mt-1 block text-right text-[9px] text-muted-foreground">
                        11.02
                      </span>
                    </div>

                    <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-emerald-100 p-2.5 shadow-2xs dark:bg-emerald-950/60">
                      <p className="text-xs text-foreground">
                        Siap kak Dina! Total Rp 76.000 via BCA 123456789 a/n
                        Warung Berkah. Langsung kami siapkan ya! 🚀
                      </p>
                      <span className="mt-1 block text-right text-[9px] text-muted-foreground">
                        11.04
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                <p className="font-medium">
                  Pembeli sudah paham menu, harga, dan total belanja sebelum
                  chat. Kamu tinggal kirim nomor rekening.
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>

        {/* BAGIAN 2: 5 PILAR NILAI BISNIS DENGAN HIGHLIGHTER */}
        <div className="mt-spacing-14 sm:mt-spacing-15 lg:mt-spacing-16">
          <ScrollReveal>
            <div className="mb-spacing-8">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Dampak Nyata untuk Usahamu
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-3xl lg:text-4xl">
                Yang terjadi saat tokomu punya website sendiri:
              </h3>
            </div>
          </ScrollReveal>

          <div className="divide-y divide-border border-y border-border">
            {VALUE_POINTS.map((point, index) => (
              <ScrollReveal
                key={point.number}
                delay={index * 0.08}
                yOffset={16}
              >
                <div className="py-spacing-7 sm:py-spacing-9">
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-baseline sm:gap-spacing-7">
                    <span className="shrink-0 font-mono text-xl font-bold tracking-tight text-muted-foreground/60 sm:text-2xl">
                      {point.number}
                    </span>

                    <div className="flex-1">
                      <h4 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
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

                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                        {point.description}
                      </p>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
