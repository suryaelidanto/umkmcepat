import { type WorkspaceCard } from "./brief";

const FALLBACK_PLACEHOLDER = "Tulis jawaban kamu di sini.";

/**
 * Backfill a default placeholder on a text question card that lacks one.
 * Cheap hedge winners (glm/minimax) often omit `placeholder`, leaving the UI
 * with the bare literal fallback. This guarantees every text card carries a
 * hint. Choice and non-question cards pass through untouched.
 */
export function ensureQuestionCardRichness(card: WorkspaceCard): WorkspaceCard {
  if (card.type !== "question") {
    return card;
  }
  const q = card.question;
  if (q.answerMode === "text" && !q.placeholder) {
    return {
      type: "question",
      question: {
        ...q,
        placeholder: FALLBACK_PLACEHOLDER,
      },
    };
  }
  return card;
}
