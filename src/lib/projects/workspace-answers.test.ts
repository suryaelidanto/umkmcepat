import { describe, expect, it } from "vitest";

import { type WorkspaceCard } from "@/lib/projects/brief";
import { buildBriefPatchFromWorkspaceAnswers } from "@/lib/projects/workspace-answers";

const businessTypeCard: WorkspaceCard = {
  type: "questions",
  questions: [
    {
      id: "businessType",
      question: "Apa jenis usaha Anda?",
      options: [
        { label: "Warung Bakso", description: "Fokus bakso." },
        { label: "Kedai Mie Ayam", description: "Fokus mie ayam." },
        { label: "Rumah Makan", description: "Fokus menu luas." },
      ],
    },
  ],
};

describe("buildBriefPatchFromWorkspaceAnswers", () => {
  it("maps structured workspace answers to the matching brief field", () => {
    const patch = buildBriefPatchFromWorkspaceAnswers({
      card: businessTypeCard,
      fallbackText: "",
      workspaceAnswers: [
        {
          answer: "aku ada toko bakso sih",
          question: "Apa jenis usaha Anda?",
          questionId: "businessType",
          source: "custom",
        },
      ],
    });

    expect(patch).toEqual({ businessType: "aku ada toko bakso sih" });
  });

  it("ignores answers that do not belong to the active stored card", () => {
    const patch = buildBriefPatchFromWorkspaceAnswers({
      card: businessTypeCard,
      fallbackText: "",
      workspaceAnswers: [
        {
          answer: "Pelanggan kantor sekitar",
          questionId: "targetCustomer",
          source: "option",
        },
      ],
    });

    expect(patch).toEqual({});
  });

  it("falls back to the visible formatted answer text for older clients", () => {
    const patch = buildBriefPatchFromWorkspaceAnswers({
      card: businessTypeCard,
      fallbackText: "1. Apa jenis usaha Anda?\nJawaban: aku ada toko bakso sih",
      workspaceAnswers: undefined,
    });

    expect(patch).toEqual({ businessType: "aku ada toko bakso sih" });
  });

  it("self-heals old repeated business-type questions with equivalent wording", () => {
    const patch = buildBriefPatchFromWorkspaceAnswers({
      card: businessTypeCard,
      fallbackText:
        "1. Apa jenis bisnis kamu saat ini?\nJawaban: aku ada toko bakso sih",
      workspaceAnswers: undefined,
    });

    expect(patch).toEqual({ businessType: "aku ada toko bakso sih" });
  });

  it("does not map an old answer to a different active field", () => {
    const patch = buildBriefPatchFromWorkspaceAnswers({
      card: {
        type: "questions",
        questions: [
          {
            id: "targetCustomer",
            question: "Siapa target pelanggan utama?",
            options: [
              { label: "Karyawan kantor", description: "Fokus makan siang." },
              { label: "Keluarga", description: "Fokus makan bersama." },
              { label: "Mahasiswa", description: "Fokus harga hemat." },
            ],
          },
        ],
      },
      fallbackText:
        "1. Apa jenis bisnis kamu saat ini?\nJawaban: aku ada toko bakso sih",
      workspaceAnswers: undefined,
    });

    expect(patch).toEqual({});
  });
});
