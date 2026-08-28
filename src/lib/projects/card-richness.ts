import { type WorkspaceCard } from "./brief";

const FALLBACK_PLACEHOLDER = "Tulis jawaban kamu di sini.";

export function ensureQuestionCardRichness(card: WorkspaceCard): WorkspaceCard {
  if (card.type !== "question") {
    return card;
  }
  const q = card.question;
  const isPrice =
    q.id.toLowerCase().includes("price") ||
    q.id.toLowerCase().includes("harga") ||
    q.question.toLowerCase().includes("harga");

  if (q.answerMode === "text" && !q.placeholder) {
    const placeholder = isPrice
      ? "Contoh: Mulai Rp 25.000"
      : FALLBACK_PLACEHOLDER;
    return {
      type: "question",
      question: {
        ...q,
        placeholder,
      },
    };
  }

  return card;
}
