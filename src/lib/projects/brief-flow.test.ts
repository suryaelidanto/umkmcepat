import { describe, expect, it } from "vitest";

import { createInitialBrief, parseProjectBrief } from "./brief";
import {
  buildFallbackWorkspaceCardFromBrief,
  decideRuleEngineDiscussPath,
  detectAckMessage,
  normalizeWorkspaceTurn,
  parseWorkspaceCard,
  shouldEscapeRuleEngine,
} from "./brief-flow";

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

describe("parseWorkspaceCard questions variant", () => {
  it("parses a valid questions[] card", () => {
    const brief = createInitialBrief("warung kopi");
    const card = parseWorkspaceCard(
      {
        type: "questions",
        questions: [
          {
            id: "jam_buka",
            question: "Jam buka hari kerja?",
            answerMode: "text",
            options: [],
          },
          {
            id: "kontak",
            question: "Pakai apa buat order?",
            options: [
              { label: "WhatsApp", description: "Chat langsung." },
              { label: "Telepon", description: "Telepon dulu." },
            ],
          },
        ],
      },
      brief,
    );
    expect(card.type).toBe("questions");
    if (card.type === "questions") {
      expect(card.questions).toHaveLength(2);
      expect(card.questions[0].id).toBe("jam_buka");
    }
  });

  it("drops an invalid question but keeps valid ones", () => {
    const brief = createInitialBrief("warung kopi");
    const card = parseWorkspaceCard(
      {
        type: "questions",
        questions: [
          {
            id: "jam_buka",
            question: "Jam buka?",
            answerMode: "text",
            options: [],
          },
          {
            id: "bad",
            question: "y",
            options: [{ label: "", description: "" }],
          },
          {
            id: "kontak",
            question: "Order via?",
            options: [
              { label: "WhatsApp", description: "Chat." },
              { label: "Telepon", description: "Call." },
            ],
          },
        ],
      },
      brief,
    );
    expect(card.type).toBe("questions");
    if (card.type === "questions") {
      expect(card.questions.map((q) => q.id)).toEqual(["jam_buka", "kontak"]);
    }
  });

  it("collapses single valid question to type:question", () => {
    const brief = createInitialBrief("warung kopi");
    const card = parseWorkspaceCard(
      {
        type: "questions",
        questions: [
          {
            id: "bad",
            question: "y",
            options: [{ label: "", description: "" }],
          },
          {
            id: "kontak",
            question: "Order via?",
            options: [
              { label: "WhatsApp", description: "" },
              { label: "Telepon", description: "" },
            ],
          },
        ],
      },
      brief,
    );
    expect(card.type).toBe("question");
    if (card.type === "question") {
      expect(card.question.id).toBe("kontak");
    }
  });

  it("dedupes by id keeping the first occurrence", () => {
    const brief = createInitialBrief("warung kopi");
    const card = parseWorkspaceCard(
      {
        type: "questions",
        questions: [
          {
            id: "kontak",
            question: "Order via?",
            options: [
              { label: "WA", description: "" },
              { label: "Telp", description: "" },
            ],
          },
          {
            id: "kontak",
            question: "Order via? (dup)",
            options: [
              { label: "WA", description: "" },
              { label: "Telp", description: "" },
            ],
          },
          {
            id: "jam_buka",
            question: "Jam buka?",
            answerMode: "text",
            options: [],
          },
        ],
      },
      brief,
    );
    expect(card.type).toBe("questions");
    if (card.type === "questions") {
      expect(card.questions.map((q) => q.id)).toEqual(["kontak", "jam_buka"]);
    }
  });

  it("caps at 3 questions", () => {
    const brief = createInitialBrief("warung kopi");
    const card = parseWorkspaceCard(
      {
        type: "questions",
        questions: Array.from({ length: 5 }, (_, i) => ({
          id: `q${i}`,
          question: `Q${i}?`,
          answerMode: "text" as const,
          options: [],
        })),
      },
      brief,
    );
    expect(card.type).toBe("questions");
    if (card.type === "questions") {
      expect(card.questions).toHaveLength(3);
    }
  });

  it("returns type:none when all questions are invalid", () => {
    const brief = createInitialBrief("warung kopi");
    const card = parseWorkspaceCard(
      {
        type: "questions",
        questions: [
          {
            id: "bad",
            question: "y",
            options: [{ label: "", description: "" }],
          },
        ],
      },
      brief,
    );
    expect(card.type).toBe("none");
  });
});

describe("buildFallbackWorkspaceCardFromBrief", () => {
  it("builds a questions card from missing required fields", () => {
    const brief = createInitialBrief("jualan");
    brief.businessType = "Katering";
    // offer, targetCustomer, contactOrCta, stylePreference still empty
    const card = buildFallbackWorkspaceCardFromBrief(brief);
    expect(card.type).toBe("questions");
    if (card.type === "questions") {
      expect(card.questions.length).toBeGreaterThan(0);
      expect(card.questions.length).toBeLessThanOrEqual(3);
      expect(
        card.questions.every(
          (q) => q.options.length >= 2 || q.answerMode === "text",
        ),
      ).toBe(true);
    }
  });

  it("returns none when no required fields are missing", () => {
    const brief = createInitialBrief("jualan");
    brief.businessType = "Katering";
    brief.offer = "Nasi kotak";
    brief.targetCustomer = "Anak sekolah";
    brief.contactOrCta = "WhatsApp";
    brief.stylePreference = "Hangat";
    const card = buildFallbackWorkspaceCardFromBrief(brief);
    expect(card.type).toBe("none");
  });
});

describe("shouldEscapeRuleEngine", () => {
  it("returns false for short empty-brief turns", () => {
    expect(shouldEscapeRuleEngine("halo")).toBe(false);
    expect(shouldEscapeRuleEngine("halo bu")).toBe(false);
  });

  it("returns true for long messages", () => {
    expect(
      shouldEscapeRuleEngine(
        "aku jualan kue di pasar dekat sekolah setiap pagi",
      ),
    ).toBe(true);
  });

  it("returns true when a URL is mentioned", () => {
    expect(shouldEscapeRuleEngine("cek www.tokopedia.com ya")).toBe(true);
    expect(shouldEscapeRuleEngine("lihat https://instagram.com/warungpedia")).toBe(
      true,
    );
  });

  it("returns true when a phone number is mentioned", () => {
    expect(shouldEscapeRuleEngine("WA 081234567890")).toBe(true);
  });

  it("returns true for real questions with multiple words", () => {
    expect(shouldEscapeRuleEngine("produknya apa saja?")).toBe(true);
  });

  it("returns false for single-word questions", () => {
    expect(shouldEscapeRuleEngine("nama?")).toBe(false);
  });
});

describe("detectAckMessage", () => {
  const fullBrief = createInitialBrief("jualan katering sekolah");
  fullBrief.businessName = "Dapur Bu Ani";
  fullBrief.businessType = "fnb";
  fullBrief.offer = "Nasi kotak";
  fullBrief.targetCustomer = "Anak sekolah";
  fullBrief.contactOrCta = "WhatsApp 08123";
  fullBrief.stylePreference = "Hangat";

  it("returns reply for thanks when brief is complete", () => {
    const ack = detectAckMessage("thanks", fullBrief);
    expect(ack).toEqual({ reply: "Sama-sama!" });
  });

  it("returns null for ack with question mark", () => {
    expect(detectAckMessage("ok?", fullBrief)).toBeNull();
  });

  it("returns null for long acks", () => {
    expect(
      detectAckMessage(
        "oke banget ya saya setuju kita lanjut ke tahap berikutnya sekarang",
        fullBrief,
      ),
    ).toBeNull();
  });

  it("returns null when there are still missing fields", () => {
    const emptyBrief = createInitialBrief("jualan kue");
    expect(detectAckMessage("oke", emptyBrief)).toBeNull();
  });

  it("returns null for messages with entities", () => {
    expect(detectAckMessage("oke wa 0812", fullBrief)).toBeNull();
  });

  it("returns null for non-ack messages", () => {
    expect(detectAckMessage("jualan kue", fullBrief)).toBeNull();
  });
});

describe("decideRuleEngineDiscussPath", () => {
  const emptyBrief = createInitialBrief("jualan katering");
  const fullBrief = createInitialBrief("jualan katering sekolah");
  fullBrief.businessName = "Dapur Bu Ani";
  fullBrief.businessType = "fnb";
  fullBrief.offer = "Nasi kotak";
  fullBrief.targetCustomer = "Anak sekolah";
  fullBrief.contactOrCta = "WhatsApp 08123";
  fullBrief.stylePreference = "Hangat";

  it("returns rule-engine for empty brief turn 0", () => {
    const d = decideRuleEngineDiscussPath({
      brief: emptyBrief,
      confidence: 5,
      existingUserTurns: 0,
      incomingLength: 1,
      text: "halo",
    });
    expect(d.path).toBe("rule-engine");
  });

  it("returns rule-engine for turn 1 still missing fields", () => {
    const d = decideRuleEngineDiscussPath({
      brief: emptyBrief,
      confidence: 25,
      existingUserTurns: 1,
      incomingLength: 1,
      text: "oke",
    });
    expect(d.path).toBe("rule-engine");
  });

  it("returns llm when user message is long", () => {
    const d = decideRuleEngineDiscussPath({
      brief: emptyBrief,
      confidence: 5,
      existingUserTurns: 0,
      incomingLength: 1,
      text: "aku jualan kue basah di pasar tradisional cibubur setiap subuh dan pesanan lewat wa",
    });
    expect(d.path).toBe("llm");
  });

  it("returns ack when ack and brief is complete at turn 0-1", () => {
    const d = decideRuleEngineDiscussPath({
      brief: fullBrief,
      confidence: 95,
      existingUserTurns: 1,
      incomingLength: 1,
      text: "ok",
    });
    expect(d.path).toBe("ack");
    if (d.path === "ack") {
      expect(d.reply).toMatch(/lanjut|oke|sama/i);
    }
  });

  it("returns llm for mid-flow (turn > 1)", () => {
    const d = decideRuleEngineDiscussPath({
      brief: emptyBrief,
      confidence: 20,
      existingUserTurns: 5,
      incomingLength: 1,
      text: "oke",
    });
    expect(d.path).toBe("llm");
  });

  it("returns llm when user message contains URL", () => {
    const d = decideRuleEngineDiscussPath({
      brief: emptyBrief,
      confidence: 5,
      existingUserTurns: 0,
      incomingLength: 1,
      text: "https://instagram.com/warungpedia",
    });
    expect(d.path).toBe("llm");
  });

  it("returns llm for multi-message incoming", () => {
    const d = decideRuleEngineDiscussPath({
      brief: emptyBrief,
      confidence: 5,
      existingUserTurns: 0,
      incomingLength: 3,
      text: "halo",
    });
    expect(d.path).toBe("llm");
  });
});
