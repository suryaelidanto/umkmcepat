import { type WorkspaceCard } from "./brief";

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
    q.includes("jualan") ||
    q.includes("sate apa")
  ) {
    return [
      { label: "Paket Utama", description: "Produk/jasa paling laku" },
      { label: "Paket Lengkap", description: "Kombinasi beberapa varian" },
      { label: "Paket Hemat", description: "Pilihan terjangkau" },
    ];
  }
  return [
    {
      label: "Opsi A",
      description: "Pilihan pertama yang direkomendasikan",
    },
    { label: "Opsi B", description: "Pilihan alternatif kedua" },
    { label: "Opsi C", description: "Pilihan ketiga untuk variasi" },
  ];
}

/**
 * Backfill a default placeholder on a text question card that lacks one.
 * Cheap models (glm/minimax) often omit `placeholder`, leaving the UI
 * with the bare literal fallback. This guarantees every text card carries a
 * hint. Also repairs choice cards that slipped through with <2 options
 * (e.g., ["","",""] after filtering) by injecting fallback choices.
 */
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
    // only synthesize for known choice intents; otherwise keep as text.
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
  // Also cover the case where a choice-intended card was incorrectly
  // downgraded to text with empty options elsewhere; if the text card has
  // empty options but the question looks like a style choice, promote it.
  // This handles legacy-normalized cards that reached here as text.
  if (
    q.answerMode === "text" &&
    q.options.length === 0 &&
    (q.id.toLowerCase().includes("style") ||
      q.id.toLowerCase().includes("visual"))
  ) {
    // Keep as text unless we have strong signal; richness keeps placeholder
    return {
      type: "question",
      question: {
        ...q,
        placeholder: q.placeholder || FALLBACK_PLACEHOLDER,
      },
    };
  }
  return card;
}
