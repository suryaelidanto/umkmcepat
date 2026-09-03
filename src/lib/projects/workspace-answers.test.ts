import { describe, expect, it } from "vitest";

import { type WorkspaceCard } from "@/lib/projects/brief";
import { buildBriefPatchFromWorkspaceAnswers } from "@/lib/projects/workspace-answers";

const businessTypeCard: WorkspaceCard = {
  type: "question",
  question: {
    id: "businessType",
    question: "Apa jenis usaha Anda?",
    options: [
      { label: "Warung Bakso", description: "Fokus bakso." },
      { label: "Kedai Mie Ayam", description: "Fokus mie ayam." },
      { label: "Rumah Makan", description: "Fokus menu luas." },
    ],
  },
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

    expect(patch).toEqual(
      expect.objectContaining({ businessType: "aku ada toko bakso sih" }),
    );
    expect(patch.facts).toContainEqual({
      key: "businessType",
      label: "Apa jenis usaha Anda?",
      value: "aku ada toko bakso sih",
    });
    expect(patch.decisions).toContainEqual({
      id: "businessType",
      question: "Apa jenis usaha Anda?",
      answer: "aku ada toko bakso sih",
    });
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

    expect(patch).toEqual(
      expect.objectContaining({ businessType: "aku ada toko bakso sih" }),
    );
  });

  it("self-heals old repeated business-type questions with equivalent wording", () => {
    const patch = buildBriefPatchFromWorkspaceAnswers({
      card: businessTypeCard,
      fallbackText:
        "1. Apa jenis bisnis kamu saat ini?\nJawaban: aku ada toko bakso sih",
      workspaceAnswers: undefined,
    });

    expect(patch).toEqual(
      expect.objectContaining({ businessType: "aku ada toko bakso sih" }),
    );
  });

  it("does not map an old answer to a different free-form active question", () => {
    const patch = buildBriefPatchFromWorkspaceAnswers({
      card: {
        type: "question",
        question: {
          id: "menu_readiness",
          question: "Soal menu, kamu udah punya daftar menu?",
          options: [
            { label: "Sudah", description: "Menu sudah siap." },
            { label: "Belum", description: "Menu belum siap." },
          ],
        },
      },
      fallbackText:
        "1. Warung Joss buka setiap hari, atau ada hari libur?\nJawaban: Setiap hari",
      workspaceAnswers: undefined,
    });

    expect(patch).toEqual({});
  });

  it("does not map an old answer to a different active field", () => {
    const patch = buildBriefPatchFromWorkspaceAnswers({
      card: {
        type: "question",
        question: {
          id: "targetCustomer",
          question: "Siapa target pelanggan utama?",
          options: [
            { label: "Karyawan kantor", description: "Fokus makan siang." },
            { label: "Keluarga", description: "Fokus makan bersama." },
            { label: "Mahasiswa", description: "Fokus harga hemat." },
          ],
        },
      },
      fallbackText:
        "1. Apa jenis bisnis kamu saat ini?\nJawaban: aku ada toko bakso sih",
      workspaceAnswers: undefined,
    });

    expect(patch).toEqual({});
  });

  it("promotes snake_case question ids to typed brief fields (regression: thin brief)", () => {
    // The discuss model generates question ids like business_name / primary_offer
    const patch = buildBriefPatchFromWorkspaceAnswers({
      card: {
        type: "question",
        question: {
          id: "business_name",
          question: "Nama brand warung kopinya apa?",
          options: [],
        },
      },
      fallbackText: "1. Nama brand warung kopinya apa?\nJawaban: Kopi Lanang",
      workspaceAnswers: undefined,
    });

    expect(patch).toEqual(
      expect.objectContaining({ businessName: "Kopi Lanang" }),
    );
    expect(patch.facts).toContainEqual({
      key: "business_name",
      label: "Nama brand warung kopinya apa?",
      value: "Kopi Lanang",
    });
  });

  it("promotes the services question to the typed offer field", () => {
    const patch = buildBriefPatchFromWorkspaceAnswers({
      card: {
        type: "question",
        question: {
          id: "services",
          question: "Layanan utamanya apa?",
          options: [
            {
              label: "Jasa laundry kiloan",
              description: "Layanan utama.",
            },
          ],
        },
      },
      fallbackText: "",
      workspaceAnswers: [
        {
          answer: "Jasa laundry kiloan",
          questionId: "services",
          source: "option",
        },
      ],
    });

    expect(patch).toEqual(
      expect.objectContaining({ offer: "Jasa laundry kiloan" }),
    );
  });

  it("promotes contact / visual_direction question ids to typed brief fields", () => {
    const contactPatch = buildBriefPatchFromWorkspaceAnswers({
      card: {
        type: "question",
        question: {
          id: "contact",
          question: "Nomor WhatsApp-nya berapa?",
          options: [],
        },
      },
      fallbackText: "1. Nomor WhatsApp-nya berapa?\nJawaban: 081234567890",
      workspaceAnswers: undefined,
    });
    expect(contactPatch).toEqual(
      expect.objectContaining({ contactOrCta: "081234567890" }),
    );

    const visualPatch = buildBriefPatchFromWorkspaceAnswers({
      card: {
        type: "question",
        question: {
          id: "visual_direction",
          question: "Mau nuansa visual apa?",
          options: [],
        },
      },
      fallbackText: "1. Mau nuansa visual apa?\nJawaban: Modern & Minimalis",
      workspaceAnswers: undefined,
    });
    expect(visualPatch).toEqual(
      expect.objectContaining({ stylePreference: "Modern & Minimalis" }),
    );
  });
});
