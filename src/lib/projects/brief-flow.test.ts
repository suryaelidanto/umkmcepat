import { describe, expect, it } from "vitest";

import { createInitialBrief, parseProjectBrief } from "./brief";
import { normalizeWorkspaceTurn } from "./brief-flow";

describe("normalizeWorkspaceTurn", () => {
  it("never throws and falls back when the tool input is empty", () => {
    const brief = createInitialBrief("jualan katering sekolah");
    const turn = normalizeWorkspaceTurn(undefined, brief);

    expect(turn.workspaceCard.type).toBe("question");
    expect(turn.projectTitle).toBe("");
  });

  it("ignores empty brief fields instead of failing the turn (regression: offer:'' )", () => {
    const brief = createInitialBrief("jualan katering sekolah");
    const turn = normalizeWorkspaceTurn(
      {
        briefPatch: { businessType: "Katering sekolah", offer: "" },
        projectTitle: "Katering Sekolah",
        workspaceCard: {
          type: "question",
          question: {
            id: "offer",
            question: "Jenis katering apa yang ingin kamu tawarkan?",
            options: [
              { label: "Nasi kotak harian", description: "Dikirim tiap hari." },
              { label: "Snack box", description: "Untuk jam istirahat." },
              { label: "Catering bulanan", description: "Langganan hemat." },
            ],
          },
        },
      },
      brief,
    );

    expect(turn.brief.businessType).toBe("Katering sekolah");
    expect(turn.brief.offer).toBe("");
    expect(turn.projectTitle).toBe("Katering Sekolah");
    expect(turn.workspaceCard.type).toBe("question");
  });

  it("drops a malformed question and falls back to a valid single question", () => {
    const brief = parseProjectBrief(
      { businessType: "Katering", targetCustomer: "Anak sekolah" },
      "jualan katering",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "question",
          question: {
            id: "offer",
            question: "y",
            options: [{ label: "", description: "" }],
          },
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.options.length).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it("migrates a legacy questions[] card to a single question", () => {
    const brief = createInitialBrief("jualan katering");
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "questions",
          questions: [
            {
              id: "businessType",
              question: "Jenis usaha apa yang kamu jalankan?",
              options: [
                { label: "Katering harian", description: "Pesanan rutin." },
                { label: "Katering acara", description: "Untuk hajatan." },
                { label: "Nasi box", description: "Kemasan praktis." },
              ],
            },
          ],
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.id).toBe("businessType");
    }
  });

  it("keeps a valid multiple-choice question mode", () => {
    const brief = createInitialBrief("jualan hampers lebaran");
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "question",
          question: {
            id: "offer",
            question: "Produk apa saja yang mau ditonjolkan?",
            selectionMode: "multiple",
            options: [
              { label: "Hampers kue kering", description: "Untuk keluarga." },
              { label: "Hampers kopi", description: "Untuk kantor." },
              { label: "Hampers custom", description: "Untuk pesanan khusus." },
            ],
          },
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.selectionMode).toBe("multiple");
    }
  });

  it("preserves realistic long option labels instead of cutting them at 48 characters", () => {
    const brief = parseProjectBrief(
      { businessType: "Warung fisik dan pesanan online" },
      "jualan angkringan",
    );
    const longLabel =
      "Menu klasik: nasi kucing, sate usus, gorengan, wedang jahe";
    const longDescription =
      "Paket standar angkringan yang paling dikenal, harga terjangkau, menu sederhana, dan mudah dipahami pelanggan baru.";
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "question",
          question: {
            id: "offer",
            question: "Menu andalan apa yang Anda jual di angkringan?",
            options: [
              {
                description: longDescription,
                label: longLabel,
              },
              {
                description:
                  "Selain menu ringan khas angkringan, ada juga menu yang lebih mengenyangkan.",
                label:
                  "Kombinasi klasik + menu berat (nasi goreng, mie goreng)",
              },
              {
                description:
                  "Menu angkringan tradisional dipadukan dengan racikan kopi susu dan minuman modern.",
                label: "Klasik + kopi kekinian",
              },
            ],
          },
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.options[0]).toEqual({
        description: longDescription,
        label: longLabel,
      });
      expect(turn.workspaceCard.question.options[1].label).toBe(
        "Kombinasi klasik + menu berat (nasi goreng, mie goreng)",
      );
    }
  });

  it("defaults invalid question mode to single-choice", () => {
    const brief = createInitialBrief("jualan hampers lebaran");
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "question",
          question: {
            id: "offer",
            question: "Produk apa yang paling utama?",
            selectionMode: "many" as never,
            options: [
              { label: "Hampers kue kering", description: "Untuk keluarga." },
              { label: "Hampers kopi", description: "Untuk kantor." },
              { label: "Hampers custom", description: "Untuk pesanan khusus." },
            ],
          },
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.selectionMode).toBe("single");
    }
  });

  it("does not force a build card just because required brief fields are filled", () => {
    const brief = parseProjectBrief(
      {
        businessType: "Dropship sepatu",
        offer: "Semua jenis sepatu",
        targetCustomer: "Anak muda",
        contactOrCta: "WhatsApp katalog",
        stylePreference: "Masih perlu dipilih",
      },
      "dropship sepatu",
    );
    const turn = normalizeWorkspaceTurn(undefined, brief);

    expect(turn.workspaceCard.type).toBe("none");
  });

  it("keeps an explicit AI question even when that field was just patched", () => {
    const brief = parseProjectBrief(
      {
        businessType: "Dropship sepatu",
        offer: "Sneakers dan sepatu casual",
        targetCustomer: "Anak muda",
        contactOrCta: "WhatsApp katalog",
      },
      "dropship sepatu",
    );
    const turn = normalizeWorkspaceTurn(
      {
        briefPatch: { stylePreference: "Enerjik dan playful" },
        workspaceCard: {
          type: "question",
          question: {
            id: "stylePreference",
            question: "Mau vibe visual yang lebih neon atau clean minimalis?",
            options: [
              { label: "Neon streetwear", description: "Cerah dan berani." },
              { label: "Clean minimalis", description: "Rapi dan premium." },
              { label: "Sporty katalog", description: "Fokus produk." },
            ],
          },
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.id).toBe("stylePreference");
    }
  });

  it("accepts a build recommendation with a flexible summary", () => {
    const brief = parseProjectBrief(
      {
        businessType: "Katering sekolah",
        offer: "Nasi kotak harian",
        targetCustomer: "Anak sekolah",
        contactOrCta: "Pesan via WhatsApp",
        stylePreference: "Cerah dan ramah",
      },
      "jualan katering",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "build_recommendation",
          title: "Website katering sekolah",
          summary: [
            "Landing page katering untuk anak sekolah",
            "Pemesanan lewat WhatsApp",
          ],
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("build_recommendation");
    if (turn.workspaceCard.type === "build_recommendation") {
      expect(turn.workspaceCard.summary.length).toBeGreaterThan(0);
    }
  });
});
