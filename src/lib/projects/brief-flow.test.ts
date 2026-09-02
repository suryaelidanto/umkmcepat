import { describe, expect, it } from "vitest";

import { createInitialBrief, parseProjectBrief } from "./brief";
import { normalizeWorkspaceTurn } from "./brief-flow";

function parseBuildReadyBrief(value: Record<string, unknown>, prompt: string) {
  const fieldState =
    value.fieldState && typeof value.fieldState === "object"
      ? value.fieldState
      : {};
  return parseProjectBrief(
    {
      ...value,
      fieldState: {
        address: "declined",
        hours: "declined",
        deliveryArea: "declined",
        visuals: "declined",
        ...fieldState,
      },
    },
    prompt,
  );
}

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

  it("keeps explicit visitor jobs and ignores an invalid replacement", () => {
    const brief = createInitialBrief("buat web kedai");
    const turn = normalizeWorkspaceTurn(
      {
        briefPatch: {
          visitorJobs: [
            {
              id: "primary",
              goal: "Memilih menu dan memesan",
              priority: "primary",
            },
            {
              id: "location",
              goal: "Menemukan lokasi kedai",
              priority: "secondary",
            },
          ],
        },
        workspaceCard: { type: "none" },
      },
      brief,
    );

    expect(turn.brief.visitorJobs).toEqual([
      {
        id: "primary",
        goal: "Memilih menu dan memesan",
        priority: "primary",
      },
      {
        id: "location",
        goal: "Menemukan lokasi kedai",
        priority: "secondary",
      },
    ]);

    const unchanged = normalizeWorkspaceTurn(
      {
        briefPatch: {
          visitorJobs: [
            {
              id: "primary",
              goal: "Memilih menu dan memesan",
              priority: "primary",
            },
            {
              id: "primary",
              goal: "Menemukan lokasi kedai",
              priority: "secondary",
            },
          ],
        },
        workspaceCard: { type: "none" },
      },
      turn.brief,
    );

    expect(unchanged.brief.visitorJobs).toEqual(turn.brief.visitorJobs);
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
            question: "",
            options: [{ label: "", description: "" }],
          },
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("none");
  });

  it("falls back to a text question when options are missing or less than 2", () => {
    const brief = parseProjectBrief({}, "jualan katering");
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
      expect(turn.workspaceCard.question.answerMode).toBe("text");
    }
  });

  it("converts to text mode when choices are invalid or empty instead of fabricating generic Opsi A/B/C options", () => {
    const brief = createInitialBrief("jualan jamu");
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "question",
          question: {
            id: "visual_direction",
            question: "Vibe website mau gimana?",
            answerMode: "choice",
            options: ["", "", ""],
          },
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.answerMode).toBe("text");
      expect(turn.workspaceCard.question.options).toEqual([]);
      expect(JSON.stringify(turn.workspaceCard)).not.toMatch(
        /Opsi A|Modern & Bersih/,
      );
    }
  });

  it("falls back to text mode when only one valid option parses", () => {
    const brief = createInitialBrief("jualan jamu");
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "question",
          question: {
            id: "visual_direction",
            question: "Vibe website mau gimana?",
            answerMode: "choice",
            options: [{ label: "Natural & Earthy", description: "" }, "", ""],
          },
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.answerMode).toBe("text");
      expect(turn.workspaceCard.question.options).toEqual([]);
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
            placeholder: "Dapur Sari Laut",
          },
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.answerMode).toBe("text");
      expect(turn.workspaceCard.question.options).toEqual([]);
      expect(turn.workspaceCard.question.placeholder).toBe("Dapur Sari Laut");
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
            placeholder: "Laundry Bekasi Fresh",
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

  it("preserves the structured question card contract", () => {
    const brief = createInitialBrief("jualan jamu sehat");
    const turn = normalizeWorkspaceTurn(
      {
        assistantText: "Aku butuh arah visualnya dulu.",
        workspaceCard: {
          type: "question",
          question: {
            id: "visual_direction",
            question: "Vibe website Jamu Surya mau gimana?",
            answerMode: "choice",
            selectionMode: "single",
            recommendedOptionLabel: "Natural",
            options: [
              { label: "Natural", description: "Hijau, hangat, herbal." },
              { label: "Modern", description: "Putih, bersih, premium." },
            ],
          },
        },
      },
      brief,
    );

    expect(turn.readyForBuild).toBe(false);
    expect(turn.workspaceCard).toEqual({
      type: "question",
      question: {
        id: "visual_direction",
        question: "Vibe website Jamu Surya mau gimana?",
        answerMode: "choice",
        selectionMode: "single",
        recommendedOptionLabel: "Natural",
        options: [
          { label: "Natural", description: "Hijau, hangat, herbal." },
          { label: "Modern", description: "Putih, bersih, premium." },
        ],
        placeholder: undefined,
        required: false,
        whyThisQuestionMatters: undefined,
      },
    });
  });

  it("preserves the structured image upload card contract", () => {
    const brief = createInitialBrief("jualan jamu sehat");
    const turn = normalizeWorkspaceTurn(
      {
        assistantText: "Foto produk bisa bikin websitenya lebih dipercaya.",
        workspaceCard: {
          type: "image_upload",
          imageUpload: {
            id: "product_images",
            question: "Kirim foto produk atau proses produksi Jamu Surya.",
            hint: "Botol jamu, bahan herbal, atau tempat produksi.",
            selectionMode: "multiple",
            purpose: "business-image",
            required: true,
          },
        },
      },
      brief,
    );

    expect(turn.readyForBuild).toBe(false);
    expect(turn.workspaceCard).toEqual({
      type: "image_upload",
      imageUpload: {
        id: "product_images",
        question: "Kirim foto produk atau proses produksi Jamu Surya.",
        hint: "Botol jamu, bahan herbal, atau tempat produksi.",
        selectionMode: "multiple",
        purpose: "business-image",
        required: true,
      },
    });
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

  it("allows an explicit build-now request with only the four safety minimums", () => {
    const brief = parseProjectBrief(
      {
        businessName: "Kedai Pagi",
        offer: "Kopi susu",
        contactOrCta: "Lihat menu",
      },
      "jualan kopi",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "build_recommendation",
          title: "Buat sekarang",
          summary: [],
        },
      },
      brief,
      { lastUserText: "buat sekarang" },
    );

    expect(turn.workspaceCard.type).toBe("build_recommendation");
    expect(turn.readyForBuild).toBe(true);
  });

  it("accepts brief_review as build_recommendation when min brief is filled (even if confidence low)", () => {
    const brief = parseBuildReadyBrief(
      {
        businessName: "Laundry Berkah",
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

    expect(turn.workspaceCard.type).toBe("build_recommendation");
    expect(turn.readyForBuild).toBe(true);
    expect(turn.brief.confidence).toBeGreaterThanOrEqual(95);
  });

  it("emits build_recommendation when AI sends brief_review and confidence is 95+", () => {
    const brief = parseBuildReadyBrief(
      {
        businessName: "Laundry Berkah",
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

  it("accepts brief_review without nested question when min brief is filled", () => {
    const brief = parseBuildReadyBrief(
      {
        businessName: "Laundry Berkah",
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

    expect(turn.workspaceCard.type).toBe("build_recommendation");
    expect(turn.readyForBuild).toBe(true);
  });

  it("emits a deterministic readiness question when brief_review arrives with thin brief and no nested question", () => {
    const brief = parseProjectBrief(
      {
        businessType: "Laundry kiloan",
        confidence: 60,
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

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.id).toBe("business.name");
    }
    expect(turn.readyForBuild).toBe(false);
  });

  it("downgrades build_recommendation when brief is still too thin", () => {
    const brief = parseProjectBrief(
      {
        businessType: "Katering sekolah",
        confidence: 70,
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

  it("downgrades build_recommendation even at confidence 95 when typed brief fields are empty (regression: slow legacy loop)", () => {
    // The model stamped confidence 95 + empty openQuestions with a fact-only
    const brief = parseProjectBrief(
      {
        businessType: "fnb",
        confidence: 95,
        openQuestions: [],
      },
      "warung kopi",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "build_recommendation",
          title: "Siap dibuild",
          summary: ["fnb"],
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.id).toBe("business.name");
    }
    expect(turn.readyForBuild).toBe(false);
  });

  it("promotes snake_case fact answers into typed brief fields (regression: batched admission blocked)", () => {
    // The discuss model answers questions by appending facts only; the typed
    const brief = parseBuildReadyBrief(
      {
        businessType: "fnb",
        confidence: 55,
      },
      "warung kopi",
    );
    const turn = normalizeWorkspaceTurn(
      {
        briefPatch: {
          confidence: 95,
          facts: [
            { key: "business_name", label: "Nama brand", value: "Kopi Lanang" },
            {
              key: "primary_offer",
              label: "Menu utama",
              value: "Kopi Susu Gula Aren",
            },
            { key: "contact", label: "Kontak", value: "WhatsApp 081234567890" },
            {
              key: "target_customer",
              label: "Target",
              value: "Anak muda di Jogja",
            },
            {
              key: "visual_direction",
              label: "Gaya visual",
              value: "Modern & Minimalis",
            },
          ],
        },
        workspaceCard: {
          type: "build_recommendation",
          title: "Siap dibuild",
          summary: ["fnb"],
        },
      },
      brief,
      {
        ownerTexts: [
          "Nama usaha Kopi Lanang, menu utama Kopi Susu Gula Aren, WhatsApp 081234567890, pelanggan Anak muda di Jogja, gaya Modern & Minimalis.",
        ],
      },
    );

    expect(turn.brief.businessName).toBe("Kopi Lanang");
    expect(turn.brief.offer).toBe("Kopi Susu Gula Aren");
    expect(turn.brief.contactOrCta).toBe("WhatsApp 081234567890");
    expect(turn.brief.targetCustomer).toBe("Anak muda di Jogja");
    expect(turn.brief.stylePreference).toBe("Modern & Minimalis");
    expect(turn.workspaceCard.type).toBe("build_recommendation");
    expect(turn.readyForBuild).toBe(true);
  });

  it("promotes build_confirm question to build_recommendation when brief is enough", () => {
    const brief = parseBuildReadyBrief(
      {
        businessName: "Surya Beauty",
        businessType: "Salon",
        offer: "Perawatan",
        targetCustomer: "Wanita",
        contactOrCta: "WA",
        stylePreference: "Elegan",
        confidence: 1,
      },
      "salon",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "question",
          question: {
            id: "build_confirm",
            question: "Langsung bangun website Surya Beauty sekarang?",
            answerMode: "text",
            options: [],
            selectionMode: "single",
          },
        },
      },
      brief,
    );
    expect(turn.workspaceCard.type).toBe("build_recommendation");
    expect(turn.readyForBuild).toBe(true);
    expect(turn.brief.confidence).toBeGreaterThanOrEqual(95);
  });

  it("accepts build_recommendation when confidence is low but brief is enough", () => {
    const brief = parseBuildReadyBrief(
      {
        businessName: "Surya Beauty",
        businessType: "Salon",
        offer: "Perawatan wajah",
        targetCustomer: "Wanita dewasa",
        contactOrCta: "WhatsApp",
        stylePreference: "Elegan",
        confidence: 1,
        openQuestions: [],
      },
      "salon",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "build_recommendation",
          title: "Siap dibuild",
          summary: ["Landing salon", "CTA WhatsApp"],
        },
      },
      brief,
    );
    expect(turn.workspaceCard.type).toBe("build_recommendation");
    if (turn.workspaceCard.type === "build_recommendation") {
      expect(turn.workspaceCard.title).toBe("Siap dibuat");
    }
    expect(turn.readyForBuild).toBe(true);
    expect(turn.brief.confidence).toBeGreaterThanOrEqual(95);
  });

  it("preserves build recommendation as a handoff card, not a side effect", () => {
    const brief = parseBuildReadyBrief(
      {
        businessName: "Jamu Surya",
        businessType: "Minuman herbal",
        offer: "Jamu kunyit asam dan beras kencur",
        targetCustomer: "Pelanggan sehat alami",
        contactOrCta: "WhatsApp",
        stylePreference: "Natural dan hangat",
        confidence: 1,
      },
      "jualan jamu",
    );
    const turn = normalizeWorkspaceTurn(
      {
        assistantText: "Brief sudah cukup, aku bisa mulai susun websitenya.",
        workspaceCard: {
          type: "build_recommendation",
          title: "Website Jamu Surya siap dibuat",
          summary: ["Fokus produk jamu herbal", "CTA utama WhatsApp"],
        },
      },
      brief,
    );

    expect(turn.readyForBuild).toBe(true);
    expect(turn.workspaceCard).toEqual({
      type: "build_recommendation",
      engine: "contract",
      title: "Website Jamu Surya siap dibuat",
      summary: ["Fokus produk jamu herbal", "CTA utama WhatsApp"],
    });
  });

  it("promotes when user affirms after previous build_confirm card", () => {
    const brief = parseBuildReadyBrief(
      {
        businessName: "Surya Beauty",
        businessType: "Salon",
        offer: "Perawatan",
        targetCustomer: "Wanita",
        contactOrCta: "WA",
        stylePreference: "Elegan",
        confidence: 1,
      },
      "salon",
    );
    const turn = normalizeWorkspaceTurn(
      { workspaceCard: { type: "none" } },
      brief,
      {
        lastUserText: "ya",
        previousWorkspaceCard: {
          type: "question",
          question: {
            id: "build_confirm",
            question: "Mulai bangun website sekarang?",
            answerMode: "text",
            options: [],
            selectionMode: "single",
          },
        },
      },
    );
    expect(turn.workspaceCard.type).toBe("build_recommendation");
    expect(turn.readyForBuild).toBe(true);
  });

  it("does not promote bare ya after a content question", () => {
    const brief = parseProjectBrief(
      {
        businessName: "Surya Beauty",
        businessType: "Salon",
        offer: "Perawatan",
        targetCustomer: "Wanita",
        contactOrCta: "WA",
        stylePreference: "Elegan",
        confidence: 1,
      },
      "salon",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "question",
          question: {
            id: "operational_hours",
            question: "Jam buka berapa?",
            answerMode: "text",
            options: [],
            selectionMode: "single",
          },
        },
      },
      brief,
      {
        lastUserText: "ya",
        previousWorkspaceCard: {
          type: "question",
          question: {
            id: "operational_hours",
            question: "Jam buka berapa?",
            answerMode: "text",
            options: [],
            selectionMode: "single",
          },
        },
      },
    );
    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.id).toBe("operational_hours");
    }
  });

  it("accepts a build recommendation with a flexible summary only when confidence is high", () => {
    const brief = parseBuildReadyBrief(
      {
        businessName: "Dapur Bu Ani",
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

  it("allows a clarification question card once the site is built (post-build edit choices)", () => {
    const brief = parseProjectBrief(
      { businessType: "Kopi Senja Roastery", offer: "Biji kopi roasting" },
      "jualan kopi",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "question",
          question: {
            id: "color_palette",
            question: "Mau nuansa warna yang mana?",
            options: [
              { label: "Neon biru", description: "Gamer, segar" },
              { label: "Ungu gelap", description: "Malam, premium" },
            ],
          },
        },
      },
      brief,
      { hasBuiltSite: true },
    );

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.id).toBe("color_palette");
    }
    expect(turn.readyForBuild).toBe(false);
  });

  it("suppresses a build_recommendation card once the site is built (no re-triggering a rebuild via the interview path)", () => {
    const brief = parseProjectBrief(
      { businessType: "Kopi Senja Roastery", offer: "Biji kopi roasting" },
      "jualan kopi",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "build_recommendation",
          title: "Siap dibangun ulang!",
          summary: ["Ganti warna jadi lebih gelap"],
        },
      },
      brief,
      { hasBuiltSite: true },
    );

    expect(turn.workspaceCard.type).toBe("none");
  });

  it("promotes a model clarification to an update card for an explicit post-build edit", () => {
    const brief = parseProjectBrief(
      {
        businessName: "Kopi Senja Roastery",
        businessType: "Kopi Senja Roastery",
        offer: "Biji kopi roasting",
        targetCustomer: "Pecinta kopi lokal",
        contactOrCta: "WhatsApp 08123456789",
        stylePreference: "Warm and cozy",
      },
      "jualan kopi",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "question",
          question: {
            id: "refinement",
            question: "Bagian mana yang ingin kamu perbaiki?",
          },
        },
      },
      brief,
      {
        hasBuiltSite: true,
        lastUserText:
          "Ubah teks semua tombol ajakan utama menjadi 'Hubungi via WhatsApp'. Hanya ubah teks tombol, jangan ubah tata letak, warna, gambar, isi lain, atau file lain.",
      },
    );

    expect(turn.workspaceCard.type).toBe("build_recommendation");
    if (turn.workspaceCard.type === "build_recommendation") {
      expect(turn.workspaceCard.postBuildUpdate).toBe(true);
      expect(turn.workspaceCard.title).toBe("Perbarui website");
    }
  });

  it("allows a pending update preflight to preserve a recommendation after a checkpoint", () => {
    const brief = parseProjectBrief(
      {
        businessName: "Kopi Senja Roastery",
        businessType: "Kedai kopi",
        offer: "Biji kopi roasting",
        targetCustomer: "Pecinta kopi lokal",
        contactOrCta: "WhatsApp 08123456789",
        stylePreference: "Warm and cozy",
      },
      "jualan kopi",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "build_recommendation",
          title: "Perbarui website",
          summary: ["Ubah tema"],
        },
      },
      brief,
      {
        hasBuiltSite: true,
        hasPendingUpdate: true,
        preflight: "update",
      },
    );

    expect(turn.workspaceCard.type).toBe("build_recommendation");
    if (turn.workspaceCard.type === "build_recommendation") {
      expect(turn.workspaceCard.postBuildUpdate).toBe(true);
    }
  });

  it("allows a build_recommendation card post-build when user asks to update or rebuild", () => {
    const brief = parseProjectBrief(
      {
        businessName: "Kopi Senja Roastery",
        businessType: "Kopi Senja Roastery",
        offer: "Biji kopi roasting",
        targetCustomer: "Pecinta kopi lokal",
        contactOrCta: "WhatsApp 08123456789",
        stylePreference: "Warm and cozy",
      },
      "jualan kopi",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "build_recommendation",
          title: "Perbarui website",
          summary: ["Tambahkan paket 50rb"],
        },
      },
      brief,
      {
        hasBuiltSite: true,
        lastUserText: "Tolong perbarui websitenya dengan paket 50rb",
      },
    );

    expect(turn.workspaceCard.type).toBe("build_recommendation");
    if (turn.workspaceCard.type === "build_recommendation") {
      expect(turn.workspaceCard.postBuildUpdate).toBe(true);
    }
  });

  it("automatically emits build_recommendation post-build when user asks for an edit even if model emitted type none", () => {
    const brief = parseProjectBrief(
      {
        businessName: "Kopi Senja",
        businessType: "Kedai Kopi",
        offer: "Kopi Nusantara",
        targetCustomer: "Pecinta kopi lokal",
        contactOrCta: "WhatsApp 08123456789",
        stylePreference: "Warm and cozy",
      },
      "jualan kopi",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: { type: "none" },
      },
      brief,
      {
        hasBuiltSite: true,
        lastUserText: "tambahin gambar itu di hero",
      },
    );

    expect(turn.workspaceCard.type).toBe("build_recommendation");
    if (turn.workspaceCard.type === "build_recommendation") {
      expect(turn.workspaceCard.postBuildUpdate).toBe(true);
    }
  });

  it("still allows a question card pre-build (hasBuiltSite: false / omitted) — same input as the built-site test above", () => {
    const brief = parseProjectBrief(
      { businessType: "Kopi Senja Roastery", offer: "Biji kopi roasting" },
      "jualan kopi",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "question",
          question: {
            id: "business_hours",
            question: "Jam berapa biasanya buka?",
            options: [
              { label: "Setiap hari", description: "09:00 - 22:00" },
              { label: "Senin - Jumat", description: "09:00 - 18:00" },
            ],
          },
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("question");
  });

  // Regression: the combo model sometimes double-encodes briefPatch and
  it("un-stringifies a JSON-string briefPatch and workspaceCard from the combo model", () => {
    const brief = createInitialBrief("jual baju thrifting");
    const turn = normalizeWorkspaceTurn(
      {
        // Model emitted briefPatch as a JSON string, not an object.
        briefPatch: JSON.stringify({
          businessName: "Surya Thrift",
          businessType: "retail",
        }),
        // Model emitted workspaceCard as a JSON string, not an object.
        workspaceCard: JSON.stringify({
          type: "question",
          question: {
            id: "business_name",
            question: "Nama brand thriftnya apa?",
            options: [
              { label: "Surya Thrift", description: "Pakai nama ini." },
              { label: "Lainnya", description: "Tulis sendiri." },
            ],
          },
        }),
      },
      brief,
    );

    expect(turn.brief.businessName).toBe("Surya Thrift");
    expect(turn.brief.businessType).toBe("retail");
    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.question).toBe(
        "Nama brand thriftnya apa?",
      );
    }
  });
});
