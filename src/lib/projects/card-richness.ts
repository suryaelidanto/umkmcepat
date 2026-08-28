import { type WorkspaceCard } from "./brief";

const FALLBACK_PLACEHOLDER = "Tulis jawaban kamu di sini.";

const TIER1_FIELD_IDS = new Set([
  "businessname",
  "business_name",
  "name",
  "nama",
  "offer",
  "product",
  "service",
  "produkdanjasa",
  "productorservice",
  "contact",
  "whatsapp",
  "wa",
]);

function isTier1Field(id: string): boolean {
  return TIER1_FIELD_IDS.has(id.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

export function ensureQuestionCardRichness(card: WorkspaceCard): WorkspaceCard {
  if (card.type !== "question") {
    return card;
  }
  const q = card.question;
  const isTier1 = isTier1Field(q.id);
  const required = isTier1 ? Boolean(q.required ?? true) : false;

  const isPrice =
    q.id.toLowerCase().includes("price") ||
    q.id.toLowerCase().includes("harga") ||
    q.question.toLowerCase().includes("harga");

  let answerMode = q.answerMode || "text";
  let options = Array.isArray(q.options) ? q.options : [];
  let selectionMode = q.selectionMode || "single";

  const lowerId = q.id.toLowerCase();
  const lowerQ = q.question.toLowerCase();

  // If audience / targetCustomer is missing options, supply universal choices
  if (
    options.length === 0 &&
    (lowerId.includes("audience") ||
      lowerId.includes("customer") ||
      lowerId.includes("target") ||
      lowerQ.includes("pelanggan") ||
      lowerQ.includes("audiens"))
  ) {
    answerMode = "choice";
    options = [
      {
        label: "Masyarakat Umum & Keluarga",
        description:
          "Pelanggan luas yang membutuhkan produk/layanan terpercaya",
      },
      {
        label: "Pekerja & Profesional",
        description: "Mencari kualitas, kepraktisan, dan kecepatan",
      },
      {
        label: "Mahasiswa & Anak Muda",
        description: "Menyukai tren kekinian, harga terjangkau, dan kemudahan",
      },
    ];
  }

  // If usp is missing options, supply universal choices
  if (
    options.length === 0 &&
    (lowerId.includes("usp") ||
      lowerQ.includes("keunggulan") ||
      lowerQ.includes("kelebihan"))
  ) {
    answerMode = "choice";
    selectionMode = "multiple";
    options = [
      {
        label: "Kualitas Terjamin & Bergaransi",
        description: "Standar pengerjaan tinggi dan terpercaya",
      },
      {
        label: "Harga Transparan & Terjangkau",
        description: "Biaya jelas di awal tanpa biaya siluman",
      },
      {
        label: "Respon Cepat via WhatsApp",
        description: "Pelayanan ramah dan siap membantu",
      },
      {
        label: "Pengerjaan Cepat & Rapi",
        description: "Efisien waktu dengan hasil maksimal",
      },
    ];
  }

  const placeholder =
    q.placeholder ||
    (isPrice ? "Contoh: Mulai Rp 25.000" : FALLBACK_PLACEHOLDER);

  return {
    type: "question",
    question: {
      ...q,
      answerMode,
      options,
      placeholder,
      required,
      selectionMode,
    },
  };
}
