import { createHash } from "node:crypto";

import { canonicalJson } from "./build-hash";
import { hashCanonicalBrief, type ProjectBriefV2 } from "./canonical-brief";

import type {
  HoursValue,
  PaymentMethodValue,
  SocialLinkValue,
} from "./brief-rich-fields";
import type { BuildContractV1, ContractFactV1 } from "./build-contract";
import type { BuildPlanV1 } from "./build-plan";
import type { GeneratedSiteRecipeV1 } from "./generated-site-recipes";
import type {
  ProjectSiteSchema,
  SiteSchemaFaqItem,
  SiteSchemaProduct,
} from "./site-schema";

export type GeneratedSiteMediaMode =
  "owner_assets" | "replaceable_slots" | "graphic" | "typographic";

export type GeneratedSiteContractV1 = {
  schemaVersion: 1;
  contractHash: string;
  business: {
    name: string;
    type: string;
    audience: string | null;
    primaryJob: string;
    primaryCta: {
      kind: "whatsapp" | "phone" | "visit" | "browse" | "other";
      label: string;
      target: string;
    };
  };
  content: {
    headline: string;
    subheadline: string;
    offer: string;
    promotion: string | null;
    trustPoints: string[];
    products: SiteSchemaProduct[];
    testimonials: NonNullable<ProjectSiteSchema["testimonials"]>;
    faq: SiteSchemaFaqItem[];
    usp: string[];
    hours: HoursValue[];
    paymentMethods: PaymentMethodValue[];
    priceRange: string | null;
    address: string | null;
    deliveryArea: string | null;
    socialLinks: SocialLinkValue[];
  };
  page: {
    appKind: "landing" | "marketing_site";
    archetype: string;
    routes: Array<{
      path: string;
      purpose: string;
      requiredContent: string[];
    }>;
    requiredSections: Array<{
      id: string;
      purpose: string;
      requiredContent: string[];
    }>;
    prohibitedClaims: string[];
  };
  design: {
    recipeId: string;
    recipeVersion: 1;
    composition: string;
    hierarchy: string[];
    typographyStrategy: string;
    colorStrategy: string;
    mediaMode: GeneratedSiteMediaMode;
    approvedAssets: Array<{
      assetId: string;
      mediaPath: string;
      purpose: "logo" | "hero" | "product" | "gallery" | "reference";
    }>;
    signatureElement: string;
    antiPatterns: string[];
  };
};

export type GeneratedSiteContractCompileInput = {
  contract: BuildContractV1;
  plan: BuildPlanV1;
  briefSnapshot: ProjectBriefV2;
  photoEnabled: boolean;
  recipe: GeneratedSiteRecipeV1;
};

const HASH_PREFIX = "umkmcepat:generated-site-contract:v1:";

export function compileGeneratedSiteSnapshotHash(
  briefSnapshot: ProjectBriefV2,
): string {
  return hashCanonicalBrief(briefSnapshot);
}

export function compileGeneratedSiteContract(
  input: GeneratedSiteContractCompileInput,
): GeneratedSiteContractV1 {
  if (input.plan.appKind === "interactive_app") {
    throw new Error(
      "generated-site quality supports landing and marketing_site only",
    );
  }
  const primaryJob = input.contract.visitorJobs.find(
    (job) => job.priority === "primary",
  );
  const primaryCta = input.contract.ctaIntents[0];
  if (!primaryJob || !primaryCta) {
    throw new Error("generated-site contract requires primary job and CTA");
  }
  const target = resolveCtaTarget(
    primaryCta.targetFactId,
    input.contract.facts,
  );
  if (primaryCta.targetFactId && !target) {
    throw new Error("generated-site CTA target is unresolved");
  }
  const products = offerFacts(input.contract.facts);
  const socialLinks = factArray<SocialLinkValue>(
    input.contract.facts,
    "social_link",
  );
  const testimonials = factArray<
    NonNullable<ProjectSiteSchema["testimonials"]>[number]
  >(input.contract.facts, "testimonial");
  const hours = factArray<HoursValue>(input.contract.facts, "hours");
  const paymentMethods = factArray<PaymentMethodValue>(
    input.contract.facts,
    "payment_method",
  );
  const mediaMode = resolveMediaMode(input);
  const draft = {
    schemaVersion: 1 as const,
    contractHash: "",
    business: {
      name: input.contract.identity.businessName,
      type:
        input.contract.identity.businessType ??
        input.briefSnapshot.business.type ??
        "",
      audience: input.briefSnapshot.audience || null,
      primaryJob: primaryJob.goal,
      primaryCta: {
        kind: normalizeCtaKind(primaryCta.kind),
        label: primaryCta.label,
        target,
      },
    },
    content: {
      headline:
        input.briefSnapshot.content.tagline ||
        input.briefSnapshot.business.name ||
        input.contract.identity.businessName,
      subheadline: snapshotPrimaryOffer(input.briefSnapshot) || primaryJob.goal,
      offer:
        snapshotPrimaryOffer(input.briefSnapshot) ||
        products.map((item) => item.name).join(", "),
      promotion: input.briefSnapshot.content.currentPromo,
      trustPoints: input.briefSnapshot.content.usp ?? [],
      products,
      testimonials,
      faq: [],
      usp: input.briefSnapshot.content.usp ?? [],
      hours,
      paymentMethods,
      priceRange: input.briefSnapshot.content.priceRange,
      address: addressText(input.contract.facts),
      deliveryArea: serviceAreaText(input.contract.facts),
      socialLinks,
    },
    page: {
      appKind: input.plan.appKind,
      archetype: input.plan.archetype,
      routes: input.plan.pages.map((page) => ({
        path: page.path,
        purpose: page.purpose,
        requiredContent: page.requiredFactIds,
      })),
      requiredSections: input.plan.pages.flatMap((page) =>
        page.sections.map((section) => ({
          id: section.id,
          purpose: section.purpose,
          requiredContent: section.requiredFactIds,
        })),
      ),
      prohibitedClaims: input.contract.prohibitedClaims.map(
        (claim) => claim.statement,
      ),
    },
    design: {
      recipeId: input.recipe.id,
      recipeVersion: input.recipe.version,
      composition: input.recipe.composition,
      hierarchy: input.recipe.hierarchy,
      typographyStrategy:
        "Use one deliberate type system with clear display and body roles.",
      colorStrategy:
        input.contract.preferences.visualDirection ??
        "Use accessible semantic theme roles with one deliberate accent.",
      mediaMode,
      approvedAssets: input.contract.assets.map((asset) => ({
        assetId: asset.assetId,
        mediaPath: `/media/${asset.assetId}`,
        purpose: asset.approvedPurpose,
      })),
      signatureElement:
        input.recipe.preferredPatterns[0] ?? "content-led composition",
      antiPatterns: [
        ...new Set([
          ...input.recipe.avoidPatterns,
          ...input.plan.artDirection.antiReferences,
        ]),
      ],
    },
  } satisfies GeneratedSiteContractV1;
  return {
    ...draft,
    contractHash: createHash("sha256")
      .update(HASH_PREFIX + canonicalJson(draft), "utf8")
      .digest("hex"),
  };
}

function resolveMediaMode(
  input: GeneratedSiteContractCompileInput,
): GeneratedSiteMediaMode {
  if (!input.photoEnabled) {
    return input.recipe.imageBenefiting ? "graphic" : "typographic";
  }
  if (input.contract.assets.length > 0) {
    return "owner_assets";
  }
  return input.recipe.imageBenefiting ? "replaceable_slots" : "graphic";
}

function normalizeCtaKind(
  kind: BuildContractV1["ctaIntents"][number]["kind"],
): GeneratedSiteContractV1["business"]["primaryCta"]["kind"] {
  if (
    kind === "whatsapp" ||
    kind === "phone" ||
    kind === "visit" ||
    kind === "browse"
  ) {
    return kind;
  }
  return "other";
}

function resolveCtaTarget(
  targetFactId: string | undefined,
  facts: ContractFactV1[],
): string {
  if (!targetFactId) {
    return "#kontak";
  }
  const fact = facts.find((item) => item.id === targetFactId);
  if (!fact || fact.kind !== "contact") {
    return "";
  }
  return fact.value.value;
}

function offerFacts(facts: ContractFactV1[]): SiteSchemaProduct[] {
  return facts.flatMap((fact) =>
    fact.kind === "offer"
      ? fact.value.map((item) => ({
          name: item.name,
          description: item.description,
          priceRange: item.priceRange,
        }))
      : [],
  );
}

function factArray<T>(
  facts: ContractFactV1[],
  kind: ContractFactV1["kind"],
): T[] {
  const values: T[] = [];
  for (const fact of facts) {
    if (fact.kind === kind && Array.isArray(fact.value)) {
      values.push(...(fact.value as T[]));
    }
  }
  return values;
}

function addressText(facts: ContractFactV1[]): string | null {
  const fact = facts.find((item) => item.kind === "address");
  if (!fact || fact.kind !== "address") {
    return null;
  }
  return [fact.value.line1, fact.value.city, fact.value.postalCode]
    .filter(Boolean)
    .join(", ");
}

function serviceAreaText(facts: ContractFactV1[]): string | null {
  const areas = factArray<{ area: string }>(facts, "service_area");
  return areas.length ? areas.map((item) => item.area).join(", ") : null;
}

function snapshotPrimaryOffer(snapshot: ProjectBriefV2): string | null {
  const primary = snapshot.offers.find((offer) => offer.isPrimary);
  return (primary ?? snapshot.offers[0])?.name ?? null;
}
