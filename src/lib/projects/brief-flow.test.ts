import { describe, expect, it } from "vitest";

import { createInitialBrief, parseProjectBrief } from "./brief";
import { normalizeWorkspaceTurn } from "./brief-flow";

describe("normalizeWorkspaceTurn", () => {
  it("never throws and falls back when the tool input is empty", () => {
    const brief = createInitialBrief("jualan katering sekolah");
    const turn = normalizeWorkspaceTurn(undefined, brief);

    expect(turn.workspaceCard.type).toBe("none");
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

  it("drops a malformed question without inventing a fallback question", () => {
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

    expect(turn.workspaceCard.type).toBe("none");
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

  it("does not mark the newly asked question as already answered", () => {
    const brief = createInitialBrief("butuh website restoran");
    const turn = normalizeWorkspaceTurn(
      {
        briefPatch: {
          facts: [
            {
              key: "photos_readiness",
              label: "Foto galeri",
              value: "Belum punya foto",
            },
          ],
          decisions: [
            {
              id: "photos_readiness",
              question:
                "Untuk galeri foto di website, kamu udah punya fotonya?",
              answer: "Belum punya foto",
            },
          ],
        },
        workspaceCard: {
          type: "question",
          question: {
            id: "photos_readiness",
            answerMode: "choice",
            question: "Untuk galeri foto di website, kamu udah punya fotonya?",
            options: [
              { label: "Udah punya foto", description: "Foto siap dipajang." },
              { label: "Belum", description: "Pakai placeholder dulu." },
            ],
          },
        },
      },
      brief,
    );

    expect(turn.brief.facts).toEqual([]);
    expect(turn.brief.decisions).toEqual([]);
  });

  it("accepts AI text questions without forcing fake options", () => {
    const brief = createInitialBrief("butuh website restoran");
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "question",
          question: {
            id: "business_name",
            answerMode: "text",
            question: "Nama restorannya apa?",
            placeholder: "Contoh: Dapur Sari Laut",
          },
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.answerMode).toBe("text");
      expect(turn.workspaceCard.question.options).toEqual([]);
      expect(turn.workspaceCard.question.placeholder).toBe(
        "Contoh: Dapur Sari Laut",
      );
    }
  });

  it("accepts AI question text/title and description/hint aliases", () => {
    const brief = createInitialBrief("butuh website laundry");
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "question",
          question: {
            id: "business_name",
            answerMode: "text",
            text: "Nama laundry kamu apa?",
            hint: "Nama ini akan jadi judul utama website.",
            placeholder: "Misal: Laundry Bekasi Fresh",
          },
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.question).toBe(
        "Nama laundry kamu apa?",
      );
      expect(turn.workspaceCard.question.whyThisQuestionMatters).toBe(
        "Nama ini akan jadi judul utama website.",
      );
    }
  });

  it("accepts free-form AI question ids", () => {
    const brief = createInitialBrief("butuh app booking barbershop");
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "question",
          question: {
            id: "booking_flow",
            question: "Alur booking seperti apa yang paling pas?",
            options: [
              {
                label: "WhatsApp dulu",
                description: "Pelanggan chat sebelum pilih jam.",
              },
              {
                label: "Pilih jadwal",
                description: "Pelanggan lihat slot dan pilih waktu.",
              },
              {
                label: "Datang langsung",
                description: "Website fokus info jam ramai.",
              },
            ],
          },
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.id).toBe("booking_flow");
    }
  });

  it("accepts focused two-option AI questions", () => {
    const brief = createInitialBrief("butuh website restoran");
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "question",
          question: {
            id: "menu_readiness",
            answerMode: "choice",
            question: "Menu kamu sudah siap?",
            options: [
              { label: "Sudah siap", description: "Menu tinggal dimasukkan." },
              { label: "Belum", description: "Menu perlu disusun dulu." },
            ],
          },
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.options).toHaveLength(2);
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

  it("does not invent fallback questions when confidence is low", () => {
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

  it("falls back to the embedded question when AI emits a brief_review below threshold", () => {
    const brief = parseProjectBrief(
      {
        businessType: "Laundry kiloan",
        confidence: 80,
        offer: "Cuci setrika dan antar jemput",
        openQuestions: ["Jam operasional"],
        targetCustomer: "Warga Depok",
        contactOrCta: "WhatsApp",
        stylePreference: "Bersih segar",
      },
      "laundry depok",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "brief_review",
          title: "Arah website laundry",
          summary: ["Laundry kiloan Depok"],
          actions: [{ label: "Paksa build", prompt: "Paksa build." }],
          question: {
            id: "operational_hours",
            question: "Jam operasional laundry?",
            answerMode: "choice",
            options: [
              { label: "07.00 - 21.00", description: "Buka seharian" },
              { label: "08.00 - 20.00", description: "Buka biasa" },
            ],
            selectionMode: "single",
          },
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.id).toBe("operational_hours");
    }
  });

  it("emits build_recommendation when AI sends brief_review and confidence is 95+", () => {
    const brief = parseProjectBrief(
      {
        businessType: "Laundry kiloan",
        confidence: 95,
        offer: "Cuci setrika dan antar jemput",
        openQuestions: [],
        targetCustomer: "Warga Depok",
        contactOrCta: "WhatsApp",
        stylePreference: "Bersih segar",
      },
      "laundry depok",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "brief_review",
          title: "Arah website laundry",
          summary: ["Laundry kiloan Depok", "CTA WhatsApp"],
          actions: [{ label: "Mulai build", prompt: "Mulai build sekarang." }],
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("build_recommendation");
    if (turn.workspaceCard.type === "build_recommendation") {
      expect(turn.workspaceCard.title).toBe("Arah website laundry");
    }
  });

  it("emits none when brief_review arrives below threshold without an embedded question", () => {
    const brief = parseProjectBrief(
      {
        businessType: "Laundry kiloan",
        confidence: 60,
        offer: "Cuci setrika",
        targetCustomer: "Warga Depok",
        contactOrCta: "WhatsApp",
        stylePreference: "Bersih",
      },
      "laundry",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "brief_review",
          title: "Arah website laundry",
          summary: ["Laundry"],
          actions: [{ label: "Paksa build", prompt: "Paksa build." }],
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("none");
  });

  it("downgrades a premature build_recommendation below 95% into a question", () => {
    const brief = parseProjectBrief(
      {
        businessType: "Katering sekolah",
        confidence: 70,
        offer: "Nasi kotak",
        targetCustomer: "Anak sekolah",
        contactOrCta: "WhatsApp",
        stylePreference: "Cerah",
      },
      "katering",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "build_recommendation",
          title: "Katering siap",
          summary: [],
          question: {
            id: "price_range",
            question: "Range harga per kotak?",
            answerMode: "choice",
            options: [
              { label: "Rp 15.000", description: "Entry" },
              { label: "Rp 25.000", description: "Premium" },
            ],
            selectionMode: "single",
          },
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.id).toBe("price_range");
    }
  });

  it("accepts a build recommendation with a flexible summary only when confidence is high", () => {
    const brief = parseProjectBrief(
      {
        businessType: "Katering sekolah",
        confidence: 95,
        offer: "Nasi kotak harian",
        openQuestions: [],
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
