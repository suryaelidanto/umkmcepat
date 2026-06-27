import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateObjectMock } = vi.hoisted(() => ({
  generateObjectMock: vi.fn(),
}));

vi.mock("ai", () => ({
  generateObject: generateObjectMock,
  jsonSchema: vi.fn((schema) => schema),
}));

vi.mock("@/lib/ai", () => ({
  getAiModel: vi.fn(() => "test-model"),
}));

import { createInitialBrief } from "./brief";
import {
  createFallbackDiscussionTurn,
  generateDiscussionTurn,
} from "./discussion-turn";

describe("discussion turn", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("normalizes one strict question card with a recommendation", async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: {
        assistantMessage:
          "Arah sate kamu sudah kebaca. Kita kunci fokus utama dulu supaya struktur websitenya tepat.",
        briefPatch: { businessType: "Kuliner sate" },
        intent: "ask_question",
        questionCard: {
          id: "offer",
          question: "Fokus utama website sate ini apa?",
          recommendedOptionLabel: "Menu sate lengkap",
          whyThisQuestionMatters: "Ini menentukan isi hero, menu, dan CTA.",
          options: [
            {
              label: "Menu sate lengkap",
              description: "Tampilkan varian sate, harga, dan paket makan.",
            },
            {
              label: "Catering acara",
              description: "Fokus pesanan hajatan, kantor, dan arisan.",
            },
            {
              label: "Delivery sekitar",
              description: "Fokus pesan cepat lewat WhatsApp dan area antar.",
            },
          ],
        },
      },
    });

    const turn = await generateDiscussionTurn({
      brief: createInitialBrief("buat website usaha sate"),
      chatContext: {
        messages: [],
        systemContext: "Ringkasan chat lama: belum ada.",
      },
      latestUserText: "saya mau buat usaha sate",
      messages: [],
      mode: "discuss",
    });

    expect(turn.intent).toBe("ask_question");
    expect(turn.briefPatch.businessType).toBe("Kuliner sate");
    expect(turn.workspaceCard.type).toBe("questions");
    expect(
      turn.workspaceCard.type === "questions"
        ? turn.workspaceCard.questions[0]?.recommendedOptionLabel
        : "",
    ).toBe("Menu sate lengkap");
  });

  it("rejects asking a field already filled by the same brief patch", async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        assistantMessage:
          "Saya sudah tahu jenis usahanya. Pilih opsi yang paling dekat.",
        briefPatch: { businessType: "Toko bakso" },
        intent: "ask_question",
        questionCard: {
          id: "businessType",
          question: "Apa jenis usaha Anda?",
          recommendedOptionLabel: "Warung Bakso",
          whyThisQuestionMatters: "Ini menentukan struktur website.",
          options: [
            { label: "Warung Bakso", description: "Fokus jualan bakso." },
            { label: "Kedai Kopi", description: "Fokus minuman kopi." },
            { label: "Laundry", description: "Fokus jasa cuci." },
          ],
        },
      },
    });

    await expect(
      generateDiscussionTurn({
        brief: createInitialBrief("buat website"),
        chatContext: {
          messages: [],
          systemContext: "Ringkasan chat lama: belum ada.",
        },
        latestUserText: "aku ada toko bakso sih",
        messages: [],
        mode: "discuss",
      }),
    ).rejects.toThrow("AI gagal membuat discussion turn valid");
    expect(generateObjectMock).toHaveBeenCalledTimes(3);
  });

  it("falls back without exposing option-card internals", () => {
    const turn = createFallbackDiscussionTurn(createInitialBrief("usaha sate"));

    expect(turn.assistantMessage).toContain("Saya sudah membaca");
    expect(turn.workspaceCard).toEqual({ type: "none" });
  });
});
