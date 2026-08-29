import { parseCanonicalBrief, type ProjectBriefV2 } from "./canonical-brief";

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

export function isExplicitBuildRequest(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  if (!normalized) {
    return false;
  }
  const patterns = [
    /buat\s+(sekarang|website|web|aja|langsung)/,
    /bangun\s+(sekarang|website|web|aja|langsung)/,
    /bikin\s+(sekarang|website|web|aja|langsung|webnya)/,
    /build\s+(sekarang|now|aja|langsung)/,
    /langsung\s+(buat|bikin|bangun|build|generate)/,
    /cukup\s+(itu|segitu|ini|dulu|aja)/,
    /udah\s+(cukup|lengkap|pas)/,
    /mulai\s+(buat|bikin|bangun|build)/,
  ];
  return patterns.some((p) => p.test(normalized));
}

export function fallbackUspOptions(
  _context?: string,
): Array<{ label: string; description: string }> {
  return [
    {
      label: "Kualitas Terjamin & Bergaransi",
      description: "Pelayanan terbaik untuk setiap pelanggan",
    },
    {
      label: "Harga Jujur & Transparan",
      description: "Tanpa biaya siluman dan jelas di awal",
    },
    {
      label: "Respon Cepat via WhatsApp",
      description: "Konsultasi ramah dan cepat tanggap",
    },
    {
      label: "Pengerjaan Rapi & Teliti",
      description: "Dikerjakan profesional dengan standar tinggi",
    },
  ];
}

export function getNextTieredEnrichmentCard(
  brief: ProjectBriefV2,
  options?: { uploadsEnabled?: boolean },
): WorkspaceCard | null {
  const name = brief.business.name.trim() || "usahamu";
  const context = `${brief.business.name} ${brief.business.type} ${brief.prompt}`;

  // Tier 1 Missing:
  if (!brief.business.name.trim()) {
    return {
      type: "question",
      question: {
        id: "business_name",
        question: "Nama brand atau usaha kamu apa?",
        answerMode: "text",
        selectionMode: "single",
        required: true,
        placeholder: "Contoh: Bengkel Berkah Jaya",
        options: [],
      },
    };
  }

  if (brief.offers.length === 0) {
    return {
      type: "question",
      question: {
        id: "services",
        question: `Layanan atau produk utama yang ditawarkan di ${name} apa saja?`,
        answerMode: "choice",
        selectionMode: "multiple",
        required: true,
        options: [
          {
            label: "Paket Layanan Utama",
            description: "Pilihan yang paling sering dicari pelanggan",
          },
          {
            label: "Paket Lengkap / Komplit",
            description: "Solusi menyeluruh dari awal sampai tuntas",
          },
          {
            label: "Konsultasi / Permintaan Khusus",
            description: "Disesuaikan dengan kebutuhan spesifik pelanggan",
          },
        ],
      },
    };
  }

  if (
    !brief.primaryAction ||
    !brief.primaryAction.label.trim() ||
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
        placeholder: "Contoh: 081234567890",
        options: [],
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
        placeholder: "Contoh: Jl. Kenangan No. 4, Jakarta Utara",
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
        answerMode: "text",
        selectionMode: "single",
        required: false,
        placeholder: "Contoh: Mulai Rp 35.000 (servis ringan)",
        options: [],
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
        options: fallbackUspOptions(context),
      },
    };
  }

  const fieldState = brief.fieldState as Record<string, string> | undefined;
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

  return null;
}

export function evaluateTieredBriefReadiness(
  input: ProjectBrief | ProjectBriefV2 | null | undefined,
): TieredBriefReadiness {
  const brief = parseCanonicalBrief(input ?? {});

  const missingTier1: Tier1MissingField[] = [];
  if (!brief.business.name.trim()) {
    missingTier1.push("businessName");
  }
  if (brief.offers.length === 0) {
    missingTier1.push("offer");
  }
  if (
    !brief.primaryAction ||
    !brief.primaryAction.label.trim() ||
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
