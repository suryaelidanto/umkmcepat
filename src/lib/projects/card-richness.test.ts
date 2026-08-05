import { describe, expect, it } from "vitest";

import { type WorkspaceCard } from "./brief";
import { ensureQuestionCardRichness } from "./card-richness";

describe("ensureQuestionCardRichness", () => {
  it("adds a placeholder to a text question that lacks one", () => {
    const card: WorkspaceCard = {
      type: "question",
      question: {
        id: "q1",
        question: "Nama usaha kamu?",
        answerMode: "text",
        options: [],
      },
    };
    const out = ensureQuestionCardRichness(card);
    expect(out.type).toBe("question");
    if (out.type === "question") {
      expect(out.question.placeholder).toBeTruthy();
    }
  });

  it("keeps an existing placeholder", () => {
    const card: WorkspaceCard = {
      type: "question",
      question: {
        id: "q1",
        question: "Q?",
        answerMode: "text",
        placeholder: "Contoh: Kopi Senja",
        options: [],
      },
    };
    const out = ensureQuestionCardRichness(card);
    expect(out.type).toBe("question");
    if (out.type === "question") {
      expect(out.question.placeholder).toBe("Contoh: Kopi Senja");
    }
  });

  it("leaves choice and non-question cards untouched", () => {
    const choice: WorkspaceCard = {
      type: "question",
      question: {
        id: "q2",
        question: "C?",
        answerMode: "choice",
        options: [{ label: "a", description: "d" }],
      },
    };
    expect(ensureQuestionCardRichness(choice)).toEqual(choice);
    expect(ensureQuestionCardRichness({ type: "none" })).toEqual({
      type: "none",
    });
  });
});
