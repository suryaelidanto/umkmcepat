import { Plus } from "lucide-react";
import { useState } from "react";

import { ScrollReveal } from "@/components/home/ScrollReveal";

const faqs = [
  {
    question: "Apakah UMKM Cepat benar-benar gratis?",
    answer:
      "Kamu mendapatkan modal energi gratis saat mendaftar untuk membuat, mengedit, dan melihat pratinjau websitemu sampai puas tanpa perlu kartu kredit. Jika usahamu semakin berkembang, tersedia opsi booster energi terjangkau sesuai kebutuhan tanpa biaya tersembunyi.",
  },
  {
    question: "Pesanan dari pembeli masuknya ke mana?",
    answer:
      "Langsung ke nomor WhatsApp pribadimu. Tombol pemesanan di website otomatis merangkum produk atau paket yang dipilih pembeli, jadi chat yang masuk sudah rapi dan siap transfer.",
  },
  {
    question: "Kalau ada harga atau menu baru, bagaimana cara gantinya?",
    answer:
      "Tinggal ketik permintaan di kolom chat editor, misalnya: 'Tolong ganti harga Paket A jadi Rp 25.000'. AI akan langsung memperbarui websitemu dalam hitungan detik.",
  },
  {
    question: "Apakah saya harus punya laptop atau paham coding?",
    answer:
      "Sama sekali tidak. Seluruh proses pembuatan, pengecekan pratinjau, hingga membagikan link website bisa dilakukan 100% dari HP lewat browser biasa.",
  },
  {
    question: "Bagaimana agar hasilnya maksimal?",
    answer:
      "Berikan informasi usahamu selengkap mungkin saat berdiskusi dengan AI. Jangan lewati pertanyaan agar struktur halaman, penawaran, dan teks yang dihasilkan lebih akurat dan sesuai kebutuhan usahamu.",
  },
];

export function CommunitySection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex((current) => (current === index ? null : index));
  };

  return (
    <section
      id="faq"
      className="bg-[#eceae4] px-4 py-spacing-12 text-[#1c1c1c] dark:bg-[#151515] dark:text-surface-warm-white sm:px-spacing-9 sm:py-spacing-13 lg:px-spacing-10 lg:py-spacing-14"
    >
      <div className="mx-auto max-w-5xl">
        <ScrollReveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[#1c1c1c] dark:text-surface-warm-white sm:text-4xl">
              Pertanyaan yang sering muncul
            </h2>
            <p className="mt-spacing-3 text-sm text-[#5f5f5d] dark:text-surface-warm-white/60 sm:text-base">
              Hal-hal yang sering ditanyakan sebelum mulai membuat website.
            </p>
          </div>
        </ScrollReveal>

        <div className="mt-spacing-8 divide-y divide-black/10 border-t border-black/10 dark:divide-white/[0.08] dark:border-white/[0.08]">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <ScrollReveal
                key={faq.question}
                delay={index * 0.06}
                yOffset={14}
                className="overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggle(index)}
                  aria-expanded={isOpen}
                  className="flex w-full cursor-pointer items-center justify-between gap-spacing-6 py-spacing-5 text-left text-base font-semibold text-[#1c1c1c] outline-none transition-colors duration-200 hover:text-accent-orange sm:text-lg dark:text-surface-warm-white dark:hover:text-accent-orange"
                >
                  <span>{faq.question}</span>
                  <span
                    className={`grid size-7 shrink-0 place-items-center text-black/50 transition-transform duration-300 ease-out dark:text-surface-warm-white/50 ${
                      isOpen ? "rotate-45 text-accent-orange" : "rotate-0"
                    }`}
                  >
                    <Plus className="size-5" />
                  </span>
                </button>
                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                    isOpen
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="pb-spacing-5 text-sm leading-relaxed text-[#5f5f5d] dark:text-surface-warm-white/70 sm:text-base">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
