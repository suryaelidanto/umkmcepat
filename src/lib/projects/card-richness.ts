import { type WorkspaceCard } from "./brief";

const FALLBACK_PLACEHOLDER = "Tulis jawaban kamu di sini.";
const PRICE_PLACEHOLDER = "Tulis kisaran harga atau tarif layanan.";

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

function cleanPlaceholder(value: string | undefined): string {
  return (value ?? "").replace(/^(?:contoh|misal|misalnya)\s*:\s*/i, "").trim();
}

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

  const options = Array.isArray(q.options) ? q.options : [];
  const answerMode =
    q.answerMode === "choice" && options.length >= 2 ? "choice" : "text";
  const selectionMode =
    answerMode === "choice" && q.selectionMode === "multiple"
      ? "multiple"
      : "single";

  const placeholder =
    cleanPlaceholder(q.placeholder) ||
    (isPrice ? PRICE_PLACEHOLDER : FALLBACK_PLACEHOLDER);

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
