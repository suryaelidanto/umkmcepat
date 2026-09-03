import { parseCanonicalBrief, type ProjectBriefV2 } from "./canonical-brief";
import { isFactLedgerFieldApproved } from "./fact-ledger";

import type { ProjectBrief, WorkspaceCard } from "./brief";

export type Tier1MissingField = "businessName" | "offer" | "contact";
export type Tier2MissingField = "usp" | "location" | "pricing" | "photos";

export type TieredBriefReadiness = {
  tier1: {
    satisfied: boolean;
    missing: Tier1MissingField[];
    missingLabels: string[];
  };
  tier2: {
    satisfied: boolean;
    missing: Tier2MissingField[];
    filledCount: number;
    totalCount: number;
  };
  tier3: {
    filledCount: number;
    totalCount: number;
  };
  canBuild: boolean;
};

const TIER1_LABELS: Record<Tier1MissingField, string> = {
  businessName: "Nama usaha",
  offer: "Produk atau layanan utama",
  contact: "Nomor kontak / WhatsApp",
};

export function createBuildConfirmationCard(
  brief: ProjectBriefV2,
): Extract<WorkspaceCard, { type: "question" }> {
  const name = brief.business.name.trim() || "usahamu";
  return {
    type: "question",
    question: {
      id: "confirm_build",
      question: `Semua data penting ${name} sudah lengkap! Mau langsung buat websitenya sekarang atau ada info tambahan dulu?`,
      answerMode: "choice",
      selectionMode: "single",
      required: true,
      recommendedOptionLabel: "Ya, buat websitenya sekarang",
      options: [
        {
          label: "Ya, buat websitenya sekarang",
          description: "Mulai susun struktur dan tampilan website.",
        },
        {
          label: "Masih ada info tambahan",
          description: "Ceritakan jam operasional, promo, atau kontak lainnya.",
        },
      ],
    },
  };
}

export function getNextTieredEnrichmentCard(
  brief: ProjectBriefV2,
  options?: { uploadsEnabled?: boolean; includeTier3?: boolean },
): WorkspaceCard | null {
  const name = brief.business.name.trim() || "usahamu";
  // Tier 1 Missing:
  if (
    !brief.business.name.trim() ||
    !isFactLedgerFieldApproved(brief.factLedger, "businessName")
  ) {
    return {
      type: "question",
      question: {
        id: "business_name",
        question: "Nama brand atau usaha kamu apa?",
        answerMode: "text",
        selectionMode: "single",
        required: true,
        placeholder: "Tulis nama usaha",
        options: [],
      },
    };
  }

  if (
    brief.offers.length === 0 ||
    !isFactLedgerFieldApproved(brief.factLedger, "offers")
  ) {
    const suggestedOffer =
      brief.offers.length === 1 ? brief.offers[0]?.name.trim() : "";
    return {
      type: "question",
      question: {
        id: "services",
        question: suggestedOffer
          ? `Aku mencatat ${suggestedOffer} sebagai layanan utama ${name}. Benar?`
          : `Layanan atau produk utama yang ditawarkan di ${name} apa saja?`,
        answerMode: suggestedOffer ? "choice" : "text",
        selectionMode: "single",
        required: true,
        placeholder: "Tulis produk atau layanan utama",
        options: suggestedOffer
          ? [
              {
                label: suggestedOffer,
                description: "Pilih ini kalau catatan tersebut sudah benar.",
              },
            ]
          : [],
      },
    };
  }

  if (
    !brief.primaryAction ||
    !brief.primaryAction.label.trim() ||
    (brief.primaryAction.kind !== "browse" &&
      !isFactLedgerFieldApproved(brief.factLedger, "contact")) ||
    (brief.primaryAction.kind === "whatsapp" && !brief.primaryAction.target) ||
    (brief.primaryAction.kind === "phone" && !brief.primaryAction.target)
  ) {
    return {
      type: "question",
      question: {
        id: "contact_number",
        question: "Berapa nomor WhatsApp aktif untuk pemesanan pelanggan?",
        answerMode: "text",
        selectionMode: "single",
        required: true,
        placeholder: "Tulis nomor WhatsApp aktif",
        options: [],
      },
    };
  }

  const fieldState = brief.fieldState as Record<string, string> | undefined;
  if (
    !brief.audience?.trim() &&
    !isResolvedField(fieldState, ["audience", "target_customer"])
  ) {
    return {
      type: "question",
      question: {
        id: "audience",
        question: `Siapa target pembeli utama untuk ${name}?`,
        answerMode: "choice",
        selectionMode: "single",
        required: false,
        recommendedOptionLabel: "Pelanggan umum / sekitar",
        options: [
          {
            label: "Pelanggan umum / sekitar",
            description:
              "Warga lokal, keluarga, atau perorangan di sekitar lokasi.",
          },
          {
            label: "Pekerja & profesional",
            description: "Karyawan kantor, pekerja harian, atau instansi.",
          },
          {
            label: "Pelajar & anak muda",
            description: "Siswa, mahasiswa, atau komunitas muda.",
          },
          {
            label: "Toko / reseller grosir",
            description: "Pembeli partai besar atau pedagang lain.",
          },
        ],
      },
    };
  }

  if (
    !brief.visualDirection?.trim() &&
    !isResolvedField(fieldState, ["visual_direction", "style_preference"])
  ) {
    return {
      type: "question",
      question: {
        id: "visual_direction",
        question: `Nuansa visual seperti apa yang cocok untuk ${name}?`,
        answerMode: "choice",
        selectionMode: "single",
        required: false,
        recommendedOptionLabel: "Bersih & Modern",
        options: [
          {
            label: "Bersih & Modern",
            description: "Tampilan rapi, minimalis, dan profesional.",
          },
          {
            label: "Hangat & Bersahabat",
            description: "Warna ramah, kekeluargaan, dan merakyat.",
          },
          {
            label: "Tegas & Berani",
            description: "Kontras kuat, dinamis, dan menarik perhatian cepat.",
          },
        ],
      },
    };
  }

  // Tier 2 Missing:
  const isOnlineOnly =
    brief.business.category === "jasa_online" ||
    brief.prompt.toLowerCase().includes("online only") ||
    brief.prompt.toLowerCase().includes("digital");

  if (
    !isOnlineOnly &&
    !brief.content.address?.trim() &&
    !brief.content.deliveryArea?.trim()
  ) {
    return {
      type: "question",
      question: {
        id: "address",
        question: `Di mana alamat fisik atau patokan lokasi ${name}?`,
        answerMode: "text",
        selectionMode: "single",
        required: false,
        placeholder: "Tulis alamat atau patokan lokasi",
        options: [],
      },
    };
  }

  const hasPricing =
    Boolean(brief.content.priceRange?.trim()) ||
    brief.offers.some((offer) => Boolean(offer.priceRange?.trim()));
  if (!hasPricing) {
    return {
      type: "question",
      question: {
        id: "price_range",
        question: `Berapa kisaran harga atau tarif layanan di ${name}?`,
        answerMode: "choice",
        selectionMode: "single",
        required: false,
        recommendedOptionLabel: "Di bawah Rp 50.000",
        options: [
          {
            label: "Di bawah Rp 50.000",
            description: "Menu hemat, jajanan, atau tarif harian ringan.",
          },
          {
            label: "Rp 50.000 - Rp 150.000",
            description: "Porsi standar, belanja umum, atau servis berkala.",
          },
          {
            label: "Rp 150.000 - Rp 500.000",
            description:
              "Paket keluarga, pesanan grosir, atau perawatan khusus.",
          },
          {
            label: "Di atas Rp 500.000 / Custom",
            description: "Paket borongan, katering besar, atau konsultasi.",
          },
        ],
      },
    };
  }

  if (brief.content.usp.length === 0) {
    return {
      type: "question",
      question: {
        id: "usp",
        question: `Apa keunggulan utama ${name} yang paling disukai pelanggan?`,
        answerMode: "choice",
        selectionMode: "multiple",
        required: false,
        recommendedOptionLabel: "Kualitas terjamin & konsisten",
        options: [
          {
            label: "Kualitas terjamin & konsisten",
            description: "Bahan atau pengerjaan terbaik tanpa kompromi.",
          },
          {
            label: "Harga terjangkau & hemat",
            description: "Bersaing dan pas di kantong pelanggan.",
          },
          {
            label: "Pelayanan cepat & ramah",
            description: "Respon sigap dan proses tidak berbelit.",
          },
          {
            label: "Bisa antar / pesan online",
            description: "Praktis langsung sampai tempat tujuan.",
          },
        ],
      },
    };
  }

  const photosResolved =
    brief.assets.length > 0 ||
    fieldState?.visuals === "declined" ||
    fieldState?.visuals === "answered" ||
    fieldState?.business_photos === "declined" ||
    fieldState?.business_photos === "answered" ||
    brief.provenance.facts.some(
      (f) => f.key === "visuals" || f.key === "business_photos",
    ) ||
    brief.provenance.decisions.some(
      (d) => d.id === "visuals" || d.id === "business_photos",
    );

  if (!photosResolved && options?.uploadsEnabled !== false) {
    return {
      type: "image_upload",
      imageUpload: {
        id: "business_photos",
        question: `Ada foto tempat usaha, toko, atau produk ${name} yang mau ditampilkan?`,
        hint: "Bisa unggah beberapa foto sekaligus atau lewati jika belum ada.",
        selectionMode: "multiple",
        purpose: "business-image",
        required: false,
      },
    };
  }

  // Tier 3 Optional Polish (if requested by user or continued probing):
  if (options?.includeTier3) {
    if (
      brief.content.hours.length === 0 &&
      !isResolvedField(fieldState, ["hours", "operational_hours"])
    ) {
      return {
        type: "question",
        question: {
          id: "hours",
          question: `Bagaimana jam dan hari operasional ${name}?`,
          answerMode: "choice",
          selectionMode: "single",
          required: false,
          recommendedOptionLabel: "Setiap hari (08:00 - 21:00)",
          options: [
            {
              label: "Setiap hari (08:00 - 21:00)",
              description: "Buka penuh sepanjang minggu.",
            },
            {
              label: "Senin - Jumat (09:00 - 17:00)",
              description: "Jam kerja reguler hari biasa.",
            },
            {
              label: "Buka 24 Jam",
              description: "Selalu melayani kapan saja.",
            },
          ],
        },
      };
    }

    if (
      !brief.content.currentPromo?.trim() &&
      !isResolvedField(fieldState, ["current_promo", "promo"])
    ) {
      return {
        type: "question",
        question: {
          id: "current_promo",
          question: `Apakah saat ini ada promo atau penawaran khusus di ${name}?`,
          answerMode: "choice",
          selectionMode: "single",
          required: false,
          recommendedOptionLabel: "Belum ada promo khusus",
          options: [
            {
              label: "Belum ada promo khusus",
              description: "Harga normal tanpa diskon tambahan.",
            },
            {
              label: "Diskon / paket hemat",
              description: "Potongan harga khusus atau bundling.",
            },
            {
              label: "Gratis ongkir / bonus",
              description: "Penawaran tambahan untuk pelanggan.",
            },
          ],
        },
      };
    }

    if (
      brief.content.socialLinks.length === 0 &&
      !isResolvedField(fieldState, ["social_links", "instagram", "social"])
    ) {
      return {
        type: "question",
        question: {
          id: "social_links",
          question: `Ada akun media sosial (Instagram/TikTok) untuk ${name}?`,
          answerMode: "text",
          selectionMode: "single",
          required: false,
          placeholder: "Contoh: @namabrand",
          options: [],
        },
      };
    }
  }

  return null;
}

function isResolvedField(
  fieldState: Record<string, string> | undefined,
  keys: readonly string[],
): boolean {
  return keys.some((key) =>
    ["answered", "declined", "explicitly_empty"].includes(
      fieldState?.[key] ?? "",
    ),
  );
}

export function evaluateTieredBriefReadiness(
  input: ProjectBrief | ProjectBriefV2 | null | undefined,
): TieredBriefReadiness {
  const brief = parseCanonicalBrief(input ?? {});

  const missingTier1: Tier1MissingField[] = [];
  if (
    !brief.business.name.trim() ||
    !isFactLedgerFieldApproved(brief.factLedger, "businessName")
  ) {
    missingTier1.push("businessName");
  }
  if (
    brief.offers.length === 0 ||
    !isFactLedgerFieldApproved(brief.factLedger, "offers")
  ) {
    missingTier1.push("offer");
  }
  if (
    !brief.primaryAction ||
    !brief.primaryAction.label.trim() ||
    (brief.primaryAction.kind !== "browse" &&
      !isFactLedgerFieldApproved(brief.factLedger, "contact")) ||
    (brief.primaryAction.kind === "whatsapp" && !brief.primaryAction.target) ||
    (brief.primaryAction.kind === "phone" && !brief.primaryAction.target)
  ) {
    missingTier1.push("contact");
  }

  const missingTier2: Tier2MissingField[] = [];
  if (brief.content.usp.length === 0) {
    missingTier2.push("usp");
  }
  if (!brief.content.address?.trim() && !brief.content.deliveryArea?.trim()) {
    missingTier2.push("location");
  }
  const hasPricing =
    Boolean(brief.content.priceRange?.trim()) ||
    brief.offers.some((offer) => Boolean(offer.priceRange?.trim()));
  if (!hasPricing) {
    missingTier2.push("pricing");
  }
  const evalFieldState = brief.fieldState as Record<string, string> | undefined;
  const evalPhotosResolved =
    brief.assets.length > 0 ||
    evalFieldState?.visuals === "declined" ||
    evalFieldState?.visuals === "answered" ||
    evalFieldState?.business_photos === "declined" ||
    evalFieldState?.business_photos === "answered" ||
    brief.provenance.facts.some(
      (f) => f.key === "visuals" || f.key === "business_photos",
    ) ||
    brief.provenance.decisions.some(
      (d) => d.id === "visuals" || d.id === "business_photos",
    );

  if (!evalPhotosResolved) {
    missingTier2.push("photos");
  }

  const tier2Total = 4;
  const tier2Filled = tier2Total - missingTier2.length;

  let tier3Filled = 0;
  const tier3Total = 4;
  if (brief.content.hours.length > 0) {
    tier3Filled += 1;
  }
  if (brief.content.since?.trim() || brief.audience?.trim()) {
    tier3Filled += 1;
  }
  if (brief.content.currentPromo?.trim()) {
    tier3Filled += 1;
  }
  if (brief.content.socialLinks.length > 0) {
    tier3Filled += 1;
  }

  const tier1Satisfied = missingTier1.length === 0;

  return {
    tier1: {
      satisfied: tier1Satisfied,
      missing: missingTier1,
      missingLabels: missingTier1.map((f) => TIER1_LABELS[f]),
    },
    tier2: {
      satisfied: missingTier2.length === 0,
      missing: missingTier2,
      filledCount: tier2Filled,
      totalCount: tier2Total,
    },
    tier3: {
      filledCount: tier3Filled,
      totalCount: tier3Total,
    },
    canBuild: tier1Satisfied,
  };
}
