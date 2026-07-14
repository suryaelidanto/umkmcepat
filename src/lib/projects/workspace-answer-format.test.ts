import { describe, expect, it } from "vitest";

import { type BriefQuestion } from "@/lib/projects/brief";
import { formatWorkspaceAnswerSelection } from "@/lib/projects/workspace-answer-format";

const question: BriefQuestion = {
  id: "offer",
  options: [
    {
      description:
        "Paket standar angkringan yang paling dikenal, harga terjangkau, menu sederhana.",
      label: "Menu klasik: nasi kucing, sate usus, gorengan, wedang jahe",
    },
    {
      description: "Ada menu yang lebih mengenyangkan untuk pelanggan malam.",
      label: "Kombinasi klasik + menu berat (nasi goreng, mie goreng)",
    },
  ],
  question: "Menu andalan apa yang Anda jual di angkringan?",
};

describe("formatWorkspaceAnswerSelection", () => {
  it("keeps option answer context by sending label and description", () => {
    expect(
      formatWorkspaceAnswerSelection(
        question,
        ["Menu klasik: nasi kucing, sate usus, gorengan, wedang jahe"],
        "option",
      ),
    ).toBe(
      "Menu klasik: nasi kucing, sate usus, gorengan, wedang jahe (Paket standar angkringan yang paling dikenal, harga terjangkau, menu sederhana.)",
    );
  });

  it("keeps custom answers unchanged", () => {
    expect(
      formatWorkspaceAnswerSelection(
        question,
        ["Menu saya tulis sendiri"],
        "custom",
      ),
    ).toBe("Menu saya tulis sendiri");
  });
});
