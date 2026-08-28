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

  it("preserves valid choice questions and sets non-tier1 required to false", () => {
    const choice: WorkspaceCard = {
      type: "question",
      question: {
        id: "targetCustomer",
        question: "Siapa pelanggan utama yang paling ingin kamu tarik?",
        answerMode: "choice",
        options: [
          { label: "Pekerja Kantoran", description: "Mencari kopi cepat" },
          { label: "Mahasiswa", description: "Tempat nugas" },
        ],
      },
    };
    const out = ensureQuestionCardRichness(choice);
    expect(out.type).toBe("question");
    if (out.type === "question") {
      expect(out.question.required).toBe(false);
      expect(out.question.options.length).toBe(2);
      expect(out.question.answerMode).toBe("choice");
    }
  });

  it("leaves non-question cards untouched", () => {
    expect(ensureQuestionCardRichness({ type: "none" })).toEqual({
      type: "none",
    });
  });
});
