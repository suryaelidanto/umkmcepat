import { Plus } from "lucide-react";
import { useState } from "react";

import { ScrollReveal } from "@/components/home/ScrollReveal";

const faqs = [
  {
    question: "Apakah UMKM Cepat benar-benar gratis?",
    answer:
      "Iya, semua fitur bisa kamu pakai tanpa biaya. Cukup daftar dan mulai buat websitemu.",
  },
  {
    question: "Website saya dibuat oleh AI saja?",
    answer:
      "AI membantu membuat awal website. Kamu tetap bisa mengubah isi, arah, dan hasil akhirnya.",
  },
  {
    question: "Apa data usaha saya aman?",
    answer:
      "Kami hanya meminta informasi yang kamu tulis untuk membuat website. Jangan masukkan password, nomor kartu, atau data rahasia.",
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
    <section className="bg-[#eceae4] px-4 py-spacing-10 text-[#1c1c1c] dark:bg-[#151515] dark:text-surface-warm-white sm:px-spacing-9 sm:py-spacing-12 lg:px-spacing-10">
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
              <div key={faq.question} className="overflow-hidden">
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
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
