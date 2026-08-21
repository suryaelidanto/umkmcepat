import { createHash } from "node:crypto";

import {
  type CertificationValue,
  type HoursValue,
  type PaymentMethodValue,
  type PriceValue,
  type ProductOrServiceItem,
  type PromotionValue,
  type ServiceAreaValue,
  type SocialLinkValue,
  type TestimonialValue,
} from "./brief-rich-fields";
import { canonicalJson } from "./build-hash";

import type { BuildContractV1, ContractFactV1 } from "./build-contract";
import type { GeneratedSiteHandoffInput } from "./generated-site-contract";

export type OutcomeContractRequiredField =
  "identity" | "offer" | "visitor_job" | "action";

export class OutcomeContractCompileError extends Error {
  constructor(
    public readonly field: OutcomeContractRequiredField,
    message: string,
  ) {
    super(message);
    this.name = "OutcomeContractCompileError";
  }
}

export type OutcomeSiteAction = {
  id: string;
  kind: "whatsapp" | "phone" | "visit" | "browse" | "book" | "order" | "other";
  label: string;
  href: string;
  priority: "primary" | "secondary";
};

export type OutcomeSiteRoute = {
  path: string;
  purpose: string;
  visitorJobIds: string[];
  requiredFactIds: string[];
};

export type OutcomeSiteMedia = {
  mode: "owner_assets" | "graphic" | "typographic";
  approvedAssets: Array<{
    assetId: string;
    mediaPath: string;
    purpose: string;
  }>;
};

export type OutcomeDirectedSiteContractV1 = {
  schemaVersion: 1;
  contractHash: string;
  business: {
    name: string;
    type: string | null;
    audience: string | null;
  };
  visitorJobs: Array<{
    id: string;
    goal: string;
    priority: "primary" | "secondary";
  }>;
  offers: Array<{
    name: string;
    description: string | null;
    priceRange: string | null;
    isPrimary: boolean;
  }>;
  acceptedContent: {
    tagline: string | null;
    usp: string[];
    testimonials: TestimonialValue[];
    certifications: CertificationValue[];
    hours: HoursValue[];
    paymentMethods: PaymentMethodValue[];
    priceRange: string | null;
    address: string | null;
    deliveryArea: string | null;
    socialLinks: SocialLinkValue[];
    promotion: string | null;
    otherFacts: string[];
  };
  actions: OutcomeSiteAction[];
  routes: OutcomeSiteRoute[];
  media: OutcomeSiteMedia;
  omissions: string[];
  prohibitedClaims: string[];
};

const OUTCOME_CONTRACT_HASH_PREFIX = "umkmcepat:outcome-site-contract:v1:";

function factArray<T>(
  facts: ContractFactV1[],
  kind: ContractFactV1["kind"],
): T[] {
  const list: T[] = [];
  for (const fact of facts) {
    if (fact.kind === kind && Array.isArray(fact.value)) {
      list.push(...(fact.value as T[]));
    }
  }
  return list;
}

function resolveCanonicalWhatsAppHref(value: string): string {
  const digits = value.replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return `https://wa.me/${normalized}`;
}

function resolveActionHref(
  action: BuildContractV1["ctaIntents"][number],
  facts: ContractFactV1[],
): string | null {
  const targetFact = action.targetFactId
    ? facts.find((fact) => fact.id === action.targetFactId)
    : facts.find((fact) => fact.kind === "contact");

  if (action.kind === "whatsapp") {
    if (targetFact && targetFact.kind === "contact" && targetFact.value.value) {
      return resolveCanonicalWhatsAppHref(targetFact.value.value);
    }
    return null;
  }

  if (action.kind === "phone") {
    if (targetFact && targetFact.kind === "contact" && targetFact.value.value) {
      return `tel:${targetFact.value.value.trim()}`;
    }
    return null;
  }

  if (action.kind === "visit") {
    const addressFact = facts.find((fact) => fact.kind === "address");
    if (addressFact && addressFact.kind === "address") {
      return "#lokasi";
    }
    return null;
  }

  if (action.kind === "browse") {
    return "#katalog";
  }

  if (targetFact && targetFact.kind === "contact" && targetFact.value.value) {
    const raw = targetFact.value.value.trim();
    if (
      raw.startsWith("http://") ||
      raw.startsWith("https://") ||
      raw.startsWith("tel:") ||
      raw.startsWith("mailto:")
    ) {
      return raw;
    }
  }

  return null;
}

export function compileOutcomeDirectedSiteContract(
  handoff: GeneratedSiteHandoffInput,
): OutcomeDirectedSiteContractV1 {
  const businessName = handoff.contract.identity.businessName?.trim();
  if (!businessName) {
    throw new OutcomeContractCompileError(
      "identity",
      "accepted business identity required",
    );
  }

  const offerFacts = factArray<ProductOrServiceItem>(
    handoff.contract.facts,
    "offer",
  );
  if (!offerFacts.length) {
    throw new OutcomeContractCompileError(
      "offer",
      "at least one accepted offer is required",
    );
  }

  const primaryJobs = handoff.contract.visitorJobs.filter(
    (job) => job.priority === "primary",
  );
  if (!primaryJobs.length) {
    throw new OutcomeContractCompileError(
      "visitor_job",
      "at least one primary visitor job is required",
    );
  }

  const primaryCtaIntent = handoff.contract.ctaIntents[0];
  if (!primaryCtaIntent) {
    throw new OutcomeContractCompileError(
      "action",
      "at least one primary CTA intent is required",
    );
  }

  const primaryActionHref = resolveActionHref(
    primaryCtaIntent,
    handoff.contract.facts,
  );
  if (!primaryActionHref) {
    throw new OutcomeContractCompileError(
      "action",
      `unresolved target for primary action ${primaryCtaIntent.id}`,
    );
  }

  const actions: OutcomeSiteAction[] = [
    {
      href: primaryActionHref,
      id: primaryCtaIntent.id,
      kind: primaryCtaIntent.kind,
      label: primaryCtaIntent.label?.trim() || "Hubungi",
      priority: "primary",
    },
  ];

  for (let i = 1; i < handoff.contract.ctaIntents.length; i++) {
    const secondaryIntent = handoff.contract.ctaIntents[i];
    const secondaryHref = resolveActionHref(
      secondaryIntent,
      handoff.contract.facts,
    );
    if (secondaryHref) {
      actions.push({
        href: secondaryHref,
        id: secondaryIntent.id,
        kind: secondaryIntent.kind,
        label: secondaryIntent.label?.trim() || "Lihat",
        priority: "secondary",
      });
    }
  }

  const addressFact = handoff.contract.facts.find(
    (fact) => fact.kind === "address",
  );
  const addressText =
    addressFact && addressFact.kind === "address"
      ? [
          addressFact.value.line1,
          addressFact.value.city,
          addressFact.value.postalCode,
        ]
          .filter(Boolean)
          .join(", ")
      : null;

  const serviceAreas = factArray<ServiceAreaValue>(
    handoff.contract.facts,
    "service_area",
  );
  const deliveryAreaText = serviceAreas.length
    ? serviceAreas.map((item) => item.area).join(", ")
    : null;

  const priceFacts = factArray<PriceValue>(handoff.contract.facts, "price");
  const priceRange = priceFacts.length
    ? [priceFacts[0].amount, priceFacts[0].note].filter(Boolean).join(" ")
    : null;

  const promoFacts = factArray<PromotionValue>(
    handoff.contract.facts,
    "promotion",
  );
  const promotionText = promoFacts.length
    ? [promoFacts[0].title, promoFacts[0].detail].filter(Boolean).join(" ")
    : null;

  const otherFacts = handoff.contract.facts
    .filter((fact) => fact.kind === "other" && typeof fact.value === "string")
    .map((fact) => fact.value as string);

  const taglineFact = handoff.briefSnapshot.content.tagline?.trim() || null;

  const routes: OutcomeSiteRoute[] = handoff.plan.pages.map((page) => ({
    path: page.path,
    purpose: page.purpose,
    requiredFactIds: page.requiredFactIds,
    visitorJobIds: page.visitorJobIds,
  }));

  const mediaMode: OutcomeSiteMedia["mode"] =
    handoff.contract.assets.length > 0 ? "owner_assets" : "graphic";

  const draft = {
    acceptedContent: {
      address: addressText,
      certifications: factArray<CertificationValue>(
        handoff.contract.facts,
        "certification",
      ),
      deliveryArea: deliveryAreaText,
      hours: factArray<HoursValue>(handoff.contract.facts, "hours"),
      otherFacts,
      paymentMethods: factArray<PaymentMethodValue>(
        handoff.contract.facts,
        "payment_method",
      ),
      priceRange,
      promotion: promotionText,
      socialLinks: factArray<SocialLinkValue>(
        handoff.contract.facts,
        "social_link",
      ),
      tagline: taglineFact,
      testimonials: factArray<TestimonialValue>(
        handoff.contract.facts,
        "testimonial",
      ),
      usp: handoff.briefSnapshot.content.usp ?? [],
    },
    actions,
    business: {
      audience: handoff.contract.identity.businessType
        ? (handoff.briefSnapshot.audience ?? null)
        : null,
      name: businessName,
      type: handoff.contract.identity.businessType ?? null,
    },
    media: {
      approvedAssets: handoff.contract.assets.map((asset) => ({
        assetId: asset.assetId,
        mediaPath: `/media/${asset.assetId}`,
        purpose: asset.approvedPurpose,
      })),
      mode: mediaMode,
    },
    offers: offerFacts.map((offer) => ({
      description: offer.description ?? null,
      isPrimary: Boolean(offer.isPrimary),
      name: offer.name,
      priceRange: offer.priceRange ?? null,
    })),
    omissions: handoff.contract.omissions.map(
      (omission) => omission.decisionId,
    ),
    prohibitedClaims: handoff.contract.prohibitedClaims.map(
      (claim) => claim.statement,
    ),
    routes,
    schemaVersion: 1 as const,
    visitorJobs: handoff.contract.visitorJobs,
  };

  return {
    ...draft,
    contractHash: createHash("sha256")
      .update(OUTCOME_CONTRACT_HASH_PREFIX + canonicalJson(draft), "utf8")
      .digest("hex"),
  };
}
