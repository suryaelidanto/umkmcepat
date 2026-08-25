import { parseCanonicalBrief, type ProjectBriefV2 } from "./canonical-brief";

import type { ProjectBrief } from "./brief";

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
  if (brief.assets.length === 0) {
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
