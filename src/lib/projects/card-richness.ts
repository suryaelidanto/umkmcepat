import { type WorkspaceCard } from "./brief";
import { fallbackUspOptions } from "./brief-tiered-readiness";

const FALLBACK_PLACEHOLDER = "Tulis jawaban kamu di sini.";

function isPriceQuestionRichness(id: string, question: string): boolean {
  const lowerId = id.toLowerCase();
  const q = question.toLowerCase();
  return (
    lowerId.includes("price") ||
    lowerId.includes("harga") ||
    lowerId.includes("amount") ||
    q.includes("harga") ||
    q.includes("rupiah") ||
    (q.includes("angka") && q.includes("porsi"))
  );
}

function isChoiceQuestionRichness(id: string, question: string): boolean {
  const lowerId = id.toLowerCase();
  const q = question.toLowerCase();
  return (
    lowerId.includes("style") ||
    lowerId.includes("visual") ||
    lowerId.includes("contact") ||
    lowerId.includes("offer") ||
    lowerId.includes("product") ||
    lowerId.includes("service") ||
    lowerId.includes("layanan") ||
    lowerId.includes("menu") ||
    lowerId.includes("kategori") ||
    lowerId.includes("paket") ||
    lowerId.includes("usp") ||
    q.includes("keunggulan") ||
    q.includes("kelebihan") ||
    q.includes("alasan") ||
    q.includes("layanan") ||
    q.includes("servis") ||
    q.includes("produk") ||
    q.includes("menu") ||
    q.includes("kategori") ||
    q.includes("tampilan") ||
    q.includes("gaya") ||
    q.includes("desain") ||
    q.includes("vibe") ||
    q.includes("hubungi") ||
    q.includes("pesan sate") ||
    q.includes("lewat mana") ||
    q.includes("jualan") ||
    q.includes("sate apa")
  );
}

function fallbackOptionsForRichness(
  id: string,
  question: string,
): Array<{ label: string; description: string }> {
  const q = question.toLowerCase();
  const lowerId = id.toLowerCase();
  if (
    lowerId.includes("usp") ||
    q.includes("keunggulan") ||
    q.includes("kelebihan") ||
    q.includes("alasan")
  ) {
    return fallbackUspOptions(question);
  }
  if (
    lowerId.includes("service") ||
    lowerId.includes("layanan") ||
    q.includes("bengkel") ||
    q.includes("servis") ||
    (q.includes("layanan") &&
      (q.includes("bengkel") || q.includes("motor") || q.includes("mobil")))
  ) {
    return [
      {
        label: "Servis Rutin & Ganti Oli",
        description:
          "Ganti oli mesin/transmisi, bersihkan filter & setel mesin",
      },
      {
        label: "Tune Up & Perbaikan Mesin",
        description: "Servis karburator/injeksi, perbaikan mesin & transmisi",
      },
      {
        label: "Ban, Rem & Kaki-kaki",
        description: "Ganti kampas rem, minyak rem, balancing & ganti ban",
      },
      {
        label: "Kelistrikan & Ganti Aki",
        description: "Cek aki, starter, lampu & kabel kelistrikan",
      },
    ];
  }
  if (
    lowerId.includes("style") ||
    lowerId.includes("visual") ||
    q.includes("tampilan") ||
    q.includes("gaya") ||
    q.includes("desain") ||
    q.includes("vibe")
  ) {
    return [
      {
        label: "Modern & Bersih",
        description: "Putih rapi, fokus produk — cepat dipahami pembeli",
      },
      {
        label: "Hangat Tradisional",
        description: "Krem/kayu, ramah dan dekat — cocok warung & kuliner",
      },
      {
        label: "Bold & Ceria",
        description: "Warna kuat, energik — cocok untuk pasar muda",
      },
    ];
  }
  if (
    lowerId.includes("contact") ||
    q.includes("hubungi") ||
    q.includes("pesan sate") ||
    q.includes("lewat mana")
  ) {
    return [
      { label: "WhatsApp", description: "Pesan langsung lewat chat WhatsApp" },
      { label: "Instagram DM", description: "Pesan lewat Instagram" },
      { label: "Telepon", description: "Hubungi nomor langsung" },
    ];
  }
  if (
    lowerId.includes("offer") ||
    lowerId.includes("product") ||
    lowerId.includes("layanan") ||
    lowerId.includes("service") ||
    lowerId.includes("menu") ||
    q.includes("jualan") ||
    q.includes("sate apa") ||
    q.includes("menu") ||
    q.includes("layanan")
  ) {
    return [
      {
        label: "Paket Utama",
        description: "Produk/jasa paling laku dan dicari",
      },
      {
        label: "Paket Lengkap",
        description: "Kombinasi layanan & produk komplit",
      },
      {
        label: "Paket Hemat",
        description: "Pilihan terjangkau untuk pelanggan baru",
      },
    ];
  }
  return [
    {
      label: "Pilihan Utama",
      description: "Opsi paling umum dan direkomendasikan",
    },
    {
      label: "Pilihan Tambahan",
      description: "Opsi pelengkap untuk pelanggan",
    },
    {
      label: "Layanan Khusus",
      description: "Permintaan custom / sesuai kebutuhan",
    },
  ];
}

export function ensureQuestionCardRichness(card: WorkspaceCard): WorkspaceCard {
  if (card.type !== "question") {
    return card;
  }
  const q = card.question;
  const isPrice = isPriceQuestionRichness(q.id, q.question);
  if (q.answerMode === "text" && !q.placeholder) {
    const placeholder = isPrice
      ? q.question.toLowerCase().includes("berapa harga") ||
        q.id.toLowerCase() === "price_range"
        ? "Contoh: Rp 25.000 per porsi (10 tusuk)"
        : "Contoh: Rp 25.000"
      : FALLBACK_PLACEHOLDER;
    return {
      type: "question",
      question: {
        ...q,
        placeholder,
      },
    };
  }
  if (q.answerMode === "choice" && q.options.length === 0) {
    // Price questions should never be choice — convert to text with example.
    if (isPrice) {
      const placeholder =
        q.question.toLowerCase().includes("berapa harga") ||
        q.id.toLowerCase() === "price_range"
          ? "Contoh: Rp 25.000 per porsi (10 tusuk)"
          : "Contoh: Rp 25.000";
      return {
        type: "question",
        question: {
          ...q,
          answerMode: "text",
          options: [],
          placeholder: q.placeholder || placeholder,
        },
      };
    }
    // Generic Opsi A/B/C for unknown ids (delivery_area, hours) is not real —
    if (!isChoiceQuestionRichness(q.id, q.question)) {
      const placeholder = FALLBACK_PLACEHOLDER;
      return {
        type: "question",
        question: {
          ...q,
          answerMode: "text",
          options: [],
          placeholder: q.placeholder || placeholder,
        },
      };
    }
    const fallback = fallbackOptionsForRichness(q.id, q.question);
    return {
      type: "question",
      question: {
        ...q,
        options: fallback.slice(0, 5),
      },
    };
  }
  // Also cover the case where a choice-intended card was incorrectly emitted as text with empty options
  if (
    q.answerMode === "text" &&
    q.options.length === 0 &&
    isChoiceQuestionRichness(q.id, q.question) &&
    !isPrice
  ) {
    const fallback = fallbackOptionsForRichness(q.id, q.question);
    return {
      type: "question",
      question: {
        ...q,
        answerMode: "choice",
        selectionMode:
          q.id.toLowerCase().includes("style") ||
          q.id.toLowerCase().includes("visual")
            ? "single"
            : "multiple",
        options: fallback.slice(0, 5),
      },
    };
  }
  return card;
}
