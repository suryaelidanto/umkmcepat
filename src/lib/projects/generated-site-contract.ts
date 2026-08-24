import { createHash } from "node:crypto";

import { canonicalJson } from "./build-hash";
import { hashCanonicalBrief, type ProjectBriefV2 } from "./canonical-brief";

import type {
  CertificationValue,
  HoursValue,
  PaymentMethodValue,
  SocialLinkValue,
  TestimonialValue,
} from "./brief-rich-fields";
import type {
  BuildContractV1,
  ContractFactV1,
  FactKind,
} from "./build-contract";
import type { BuildPlanV1 } from "./build-plan";
import type {
  GeneratedSiteDesignKitV1,
  GeneratedSiteKitMediaMode,
} from "./generated-site-design-kits/types";
import type { GeneratedSiteRecipeV1 } from "./generated-site-recipes";
import type {
  GeneratedSiteDesignKitV2,
  ProfessionalContentRole,
} from "./professional-site-kits";
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

export type GeneratedSiteHandoffInput = {
  id: string;
  briefSnapshot: ProjectBriefV2;
  briefHash: string;
  briefRevision: 2;
  contract: BuildContractV1;
  plan: BuildPlanV1;
  contractHash: string;
  planHash: string;
  contractRevision: number;
  planRevision: number;
};

export type GeneratedSiteContractCompileInput = {
  contract: BuildContractV1;
  plan: BuildPlanV1;
  briefSnapshot: ProjectBriefV2;
  photoEnabled: boolean;
  recipe: GeneratedSiteRecipeV1;
};

const HASH_PREFIX = "umkmcepat:generated-site-contract:v1:";
const HASH_PREFIX_V2 = "umkmcepat:generated-site-writer-contract:v2:";

export type GeneratedSiteWriterContractV2 = {
  schemaVersion: 2;
  contractHash: string;
  handoff: {
    contractHash: string;
    planHash: string;
  };
  business: GeneratedSiteContractV1["business"];
  content: GeneratedSiteContractV1["content"];
  obligations: {
    routes: Array<{
      path: string;
      purpose: string;
      requiredFactIds: string[];
      requiredSectionIds: string[];
    }>;
    sections: Array<{
      id: string;
      purpose: string;
      requiredFactIds: string[];
    }>;
    prohibitedClaims: string[];
  };
  media: {
    mode: Exclude<GeneratedSiteKitMediaMode, "replaceable_slots">;
    approvedAssets: GeneratedSiteContractV1["design"]["approvedAssets"];
  };
  visualInputs: {
    direction: string | null;
    density: "sparse" | "regular" | "rich";
    selectedKitId: GeneratedSiteDesignKitV1["id"];
    selectedKitVersion: 1;
  };
};

export type ProfessionalSiteBusinessV1 = {
  name: string;
  type: string;
  audience: string | null;
  primaryJob: string;
};

export type ProfessionalContentPath =
  | "site.businessName"
  | "site.heroTitle"
  | "site.audience"
  | "site.offers"
  | "site.usp"
  | "site.testimonials"
  | "site.certifications"
  | "site.hours"
  | "site.paymentMethods"
  | "site.priceRange"
  | "site.address"
  | "site.deliveryArea"
  | "site.socialLinks"
  | "site.promotion"
  | "site.primaryCta"
  | "site.secondaryCta"
  | "site.otherFacts";

export type ProfessionalSiteContentV1 = {
  businessName: string;
  businessType: string;
  audience: string | null;
  ownerTagline: string | null;
  heroTitle: string;
  offers: SiteSchemaProduct[];
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
  primaryCta: {
    intentId: string;
    kind:
      "whatsapp" | "phone" | "visit" | "browse" | "book" | "order" | "other";
    label: string;
    targetFactId: string | null;
    href: string;
  };
  secondaryCta: { label: string; target: string; href: string } | null;
  navigation: Array<{
    fromPath: string;
    toPath: string;
    label: string;
    href: string;
  }>;
  labels: {
    catalog: "Pilihan";
    proof: "Yang perlu diketahui";
    process: "Cara memesan";
    operations: "Informasi usaha";
    contact: "Hubungi";
  };
  otherFacts: string[];
};

export type GeneratedSiteWriterContractV3 = {
  schemaVersion: 3;
  contractHash: string;
  handoff: { contractHash: string; planHash: string };
  business: ProfessionalSiteBusinessV1;
  content: ProfessionalSiteContentV1;
  factIndex: Array<{ id: string; kind: FactKind }>;
  obligations: GeneratedSiteWriterContractV2["obligations"];
  media: GeneratedSiteWriterContractV2["media"];
  visualInputs: {
    direction: string | null;
    density: "sparse" | "regular" | "rich";
    selectedKitId: GeneratedSiteDesignKitV2["id"];
    selectedKitVersion: 2;
  };
};

export type GeneratedSiteWriterContractV3Input = {
  handoff: GeneratedSiteHandoffInput;
  briefSnapshot: ProjectBriefV2;
  photoEnabled: boolean;
  kit: GeneratedSiteDesignKitV2;
};

export type ProfessionalRouteRoleInput = {
  path: string;
  purpose: string;
  requiredFactIds: string[];
  requiredSectionIds: string[];
};

export type ProfessionalSectionRoleInput = {
  id: string;
  purpose: string;
  requiredFactIds: string[];
};

export function deriveProfessionalRouteRoles(input: {
  handoff: GeneratedSiteHandoffInput;
}): Array<{ path: string; roles: ProfessionalContentRole[] }> {
  return deriveProfessionalRouteRolesFromObligations({
    routes: input.handoff.plan.pages.map((page) => ({
      path: page.path,
      purpose: page.purpose,
      requiredFactIds: page.requiredFactIds,
      requiredSectionIds: page.sections.map((section) => section.id),
    })),
    sections: input.handoff.plan.pages.flatMap((page) =>
      page.sections.map((section) => ({
        id: section.id,
        purpose: section.purpose,
        requiredFactIds: section.requiredFactIds,
      })),
    ),
    facts: input.handoff.contract.facts,
  });
}

export function deriveProfessionalRouteRolesFromObligations(input: {
  routes: ProfessionalRouteRoleInput[];
  sections: ProfessionalSectionRoleInput[];
  facts: ContractFactV1[];
}): Array<{ path: string; roles: ProfessionalContentRole[] }> {
  const factsById = new Map(input.facts.map((fact) => [fact.id, fact]));
  const sectionsById = new Map(
    input.sections.map((section) => [section.id, section]),
  );
  const roleOrder: ProfessionalContentRole[] = [
    "identity",
    "offer",
    "catalog",
    "proof",
    "process",
    "operations",
    "story",
    "faq",
    "contact",
  ];
  return input.routes.map((route) => {
    const roles = new Set<ProfessionalContentRole>();
    const pageKinds = route.requiredFactIds.flatMap((factId) => {
      const fact = factsById.get(factId);
      return fact ? [fact.kind] : [];
    });
    roles.add(
      classifyProfessionalContentRole({
        id: route.path,
        purpose: route.purpose,
        requiredFactKinds: pageKinds,
      }),
    );
    if (route.path === "/") {
      roles.add("identity");
    }
    if (pageKinds.includes("offer")) {
      roles.add("offer");
    }
    for (const sectionId of route.requiredSectionIds) {
      const section = sectionsById.get(sectionId);
      if (!section) {
        continue;
      }
      roles.add(
        classifyProfessionalContentRole({
          id: section.id,
          purpose: section.purpose,
          requiredFactKinds: section.requiredFactIds.flatMap((factId) => {
            const fact = factsById.get(factId);
            return fact ? [fact.kind] : [];
          }),
        }),
      );
    }
    if (pageKinds.includes("contact")) {
      roles.add("contact");
    }
    return {
      path: route.path,
      roles: roleOrder.filter((role) => roles.has(role)),
    };
  });
}

export function classifyProfessionalContentRole(input: {
  id: string;
  purpose: string;
  requiredFactKinds: string[];
}): ProfessionalContentRole {
  const text = `${input.id} ${input.purpose}`.toLowerCase();
  const kinds = new Set(input.requiredFactKinds);
  if (
    kinds.has("contact") ||
    /contact|kontak|hubung|order|pesan|booking|book/.test(text)
  ) {
    return "contact";
  }
  if (
    kinds.has("hours") ||
    kinds.has("address") ||
    kinds.has("service_area") ||
    kinds.has("payment_method") ||
    /operat|hour|jam|location|lokasi|delivery|area layanan/.test(text)
  ) {
    return "operations";
  }
  if (
    kinds.has("testimonial") ||
    kinds.has("certification") ||
    /proof|trust|testimoni|sertif|usp|bukti|kepercayaan/.test(text)
  ) {
    return "proof";
  }
  if (/faq|question|pertanyaan|tanya jawab/.test(text)) {
    return "faq";
  }
  if (/process|proses|cara|step|langkah/.test(text)) {
    return "process";
  }
  if (/story|cerita|about|tentang|sejarah/.test(text)) {
    return "story";
  }
  if (
    kinds.has("offer") &&
    /catalog|katalog|product|produk|menu|property|properti|class|kelas|pilihan/.test(
      text,
    )
  ) {
    return "catalog";
  }
  if (/hero|intro|identity|beranda|home|usaha|business/.test(text)) {
    return "identity";
  }
  if (kinds.has("offer") || /offer|penawaran|layanan/.test(text)) {
    return "offer";
  }
  return "offer";
}

export function deriveProfessionalSiteSelectionInput(input: {
  handoff: GeneratedSiteHandoffInput;
  briefSnapshot: ProjectBriefV2;
  photoEnabled: boolean;
}): import("./professional-site-kits").ProfessionalSiteSelectionInput {
  const routeRoles = deriveProfessionalRouteRoles(input);
  const factCount = new Set(input.handoff.contract.facts.map((fact) => fact.id))
    .size;
  const contentCount =
    input.briefSnapshot.offers.length +
    input.briefSnapshot.content.usp.length +
    input.briefSnapshot.content.testimonials.length +
    input.briefSnapshot.content.certifications.length +
    input.briefSnapshot.content.hours.length +
    input.briefSnapshot.content.paymentMethods.length +
    input.briefSnapshot.content.socialLinks.length;
  const suppliedCount = factCount + contentCount;
  const density =
    suppliedCount >= 8 ? "rich" : suppliedCount >= 3 ? "regular" : "sparse";
  const mediaMode =
    input.photoEnabled && input.handoff.contract.assets.length > 0
      ? "owner_assets"
      : "graphic";
  return {
    archetype: input.handoff.plan.archetype,
    density,
    mediaMode,
    hasOperationalDetails:
      input.briefSnapshot.content.hours.length > 0 ||
      Boolean(input.briefSnapshot.content.address) ||
      Boolean(input.briefSnapshot.content.deliveryArea) ||
      input.handoff.contract.facts.some(
        (fact) =>
          fact.kind === "hours" ||
          fact.kind === "address" ||
          fact.kind === "service_area" ||
          fact.kind === "payment_method",
      ),
    routeRoles,
  };
}

export function compileProfessionalPrimaryCta(input: {
  contract: BuildContractV1;
  plan: BuildPlanV1;
  briefSnapshot: ProjectBriefV2;
}): ProfessionalSiteContentV1["primaryCta"] {
  const intent = input.contract.ctaIntents[0];
  if (!intent || !intent.label.trim()) {
    throw new Error("professional site requires an accepted primary CTA");
  }
  const targetFact = intent.targetFactId
    ? input.contract.facts.find((fact) => fact.id === intent.targetFactId)
    : undefined;
  if (intent.targetFactId && !targetFact) {
    throw new Error("professional site CTA target is unresolved");
  }
  const label = intent.label.trim();
  const href = compileProfessionalCtaHref({
    intent,
    targetFact,
    facts: input.contract.facts,
    plan: input.plan,
  });
  if (!href) {
    throw new Error("professional site CTA target is missing or unsafe");
  }
  return {
    intentId: intent.id,
    kind: intent.kind,
    label,
    targetFactId: intent.targetFactId ?? null,
    href,
  };
}

export function compileProfessionalSiteContent(input: {
  handoff: GeneratedSiteHandoffInput;
  briefSnapshot: ProjectBriefV2;
  primaryCta: ProfessionalSiteContentV1["primaryCta"];
}): ProfessionalSiteContentV1 {
  const acceptedOffers = acceptedOfferFacts(input.handoff.contract.facts);
  const secondaryAction = input.briefSnapshot.content.secondaryAction;
  const secondaryHref = secondaryAction
    ? compileAcceptedSecondaryHref({
        action: secondaryAction.action,
        plan: input.handoff.plan,
        primaryCta: input.primaryCta,
      })
    : null;
  const testimonials = acceptedArrayFacts(
    input.handoff.contract.facts,
    "testimonial",
  );
  const certifications = acceptedArrayFacts(
    input.handoff.contract.facts,
    "certification",
  );
  const hours = acceptedArrayFacts(input.handoff.contract.facts, "hours");
  const paymentMethods = acceptedArrayFacts(
    input.handoff.contract.facts,
    "payment_method",
  );
  const socialLinks = acceptedArrayFacts(
    input.handoff.contract.facts,
    "social_link",
  );
  return {
    businessName: input.handoff.contract.identity.businessName,
    businessType:
      input.handoff.contract.identity.businessType ??
      input.briefSnapshot.business.type,
    audience: input.briefSnapshot.audience,
    ownerTagline: input.briefSnapshot.content.tagline,
    heroTitle:
      input.briefSnapshot.content.tagline ??
      acceptedOffers[0]?.name ??
      input.briefSnapshot.offers[0]?.name ??
      input.handoff.contract.identity.businessName,
    offers: acceptedOffers.length
      ? acceptedOffers
      : input.briefSnapshot.offers.map((offer) => ({ ...offer })),
    usp: [...input.briefSnapshot.content.usp],
    testimonials: testimonials.length
      ? testimonials
      : [...input.briefSnapshot.content.testimonials],
    certifications: certifications.length
      ? certifications
      : [...input.briefSnapshot.content.certifications],
    hours: hours.length ? hours : [...input.briefSnapshot.content.hours],
    paymentMethods: paymentMethods.length
      ? paymentMethods
      : [...input.briefSnapshot.content.paymentMethods],
    priceRange: input.briefSnapshot.content.priceRange,
    address:
      acceptedAddressText(input.handoff.contract.facts) ??
      input.briefSnapshot.content.address,
    deliveryArea:
      acceptedServiceAreaText(input.handoff.contract.facts) ??
      input.briefSnapshot.content.deliveryArea,
    socialLinks: socialLinks.length
      ? socialLinks
      : [...input.briefSnapshot.content.socialLinks],
    promotion: input.briefSnapshot.content.currentPromo,
    primaryCta: input.primaryCta,
    secondaryCta:
      secondaryAction && secondaryHref
        ? {
            label: secondaryAction.label,
            target: secondaryAction.action,
            href: secondaryHref,
          }
        : null,
    navigation: compileAcceptedNavigation(input.handoff.plan),
    labels: {
      catalog: "Pilihan",
      proof: "Yang perlu diketahui",
      process: "Cara memesan",
      operations: "Informasi usaha",
      contact: "Hubungi",
    },
    otherFacts: acceptedArrayFacts(input.handoff.contract.facts, "other"),
  };
}

export function compileGeneratedSiteWriterContractV3(
  input: GeneratedSiteWriterContractV3Input,
): GeneratedSiteWriterContractV3 {
  if (input.handoff.plan.appKind === "interactive_app") {
    throw new Error(
      "generated-site quality supports landing and marketing_site only",
    );
  }
  const primaryJob = input.handoff.contract.visitorJobs.find(
    (job) => job.priority === "primary",
  );
  if (!primaryJob) {
    throw new Error("professional site requires a primary visitor job");
  }
  const duplicateFactIds = duplicateIds(
    input.handoff.contract.facts.map((fact) => fact.id),
  );
  if (duplicateFactIds.length > 0) {
    throw new Error(
      `professional site has duplicate fact id: ${duplicateFactIds[0]}`,
    );
  }
  validateProfessionalObligationFacts(input.handoff);
  const primaryCta = compileProfessionalPrimaryCta({
    contract: input.handoff.contract,
    plan: input.handoff.plan,
    briefSnapshot: input.briefSnapshot,
  });
  const draft = {
    schemaVersion: 3 as const,
    contractHash: "",
    handoff: {
      contractHash: input.handoff.contractHash,
      planHash: input.handoff.planHash,
    },
    business: {
      name: input.handoff.contract.identity.businessName,
      type:
        input.handoff.contract.identity.businessType ??
        input.briefSnapshot.business.type,
      audience: input.briefSnapshot.audience,
      primaryJob: primaryJob.goal,
    },
    content: compileProfessionalSiteContent({
      handoff: input.handoff,
      briefSnapshot: input.briefSnapshot,
      primaryCta,
    }),
    factIndex: input.handoff.contract.facts.map((fact) => ({
      id: fact.id,
      kind: fact.kind,
    })),
    obligations: {
      routes: input.handoff.plan.pages.map((page) => ({
        path: page.path,
        purpose: page.purpose,
        requiredFactIds: [...page.requiredFactIds],
        requiredSectionIds: page.sections.map((section) => section.id),
      })),
      sections: input.handoff.plan.pages.flatMap((page) =>
        page.sections.map((section) => ({
          id: section.id,
          purpose: section.purpose,
          requiredFactIds: [...section.requiredFactIds],
        })),
      ),
      prohibitedClaims: input.handoff.contract.prohibitedClaims.map(
        (claim) => claim.statement,
      ),
    },
    media: {
      mode: professionalMediaMode(input, input.kit),
      approvedAssets: input.handoff.contract.assets.map((asset) => ({
        assetId: asset.assetId,
        mediaPath: `/media/${asset.assetId}`,
        purpose: asset.approvedPurpose,
      })),
    },
    visualInputs: {
      direction: input.handoff.contract.preferences.visualDirection,
      density: deriveProfessionalSiteSelectionInput({
        handoff: input.handoff,
        briefSnapshot: input.briefSnapshot,
        photoEnabled: input.photoEnabled,
      }).density,
      selectedKitId: input.kit.id,
      selectedKitVersion: 2 as const,
    },
  } satisfies Omit<GeneratedSiteWriterContractV3, "contractHash"> & {
    contractHash: string;
  };
  return {
    ...draft,
    contractHash: createHash("sha256")
      .update(
        "umkmcepat:generated-site-writer-contract:v3:" + canonicalJson(draft),
        "utf8",
      )
      .digest("hex"),
  };
}

export function compileGeneratedSiteSnapshotHash(
  briefSnapshot: ProjectBriefV2,
): string {
  return hashCanonicalBrief(briefSnapshot);
}

export function createDeterministicGeneratedSiteControlRoute(
  contract: GeneratedSiteContractV1,
): string {
  const primaryActionHref = whatsappHref(contract.business.primaryCta.target);
  return `import { Button } from "@/components/ui/button";
import { site } from "@/content/site";
import { usePreviewReady } from "@/lib/preview-ready";

export function HomeRouteComponent() {
  usePreviewReady();

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <section className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-16 md:grid-cols-[1.1fr_.9fr] md:items-center md:px-12 md:py-24">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">{site.eyebrow}</p>
          <h1 className="mt-5 max-w-3xl text-balance text-5xl font-semibold tracking-[-0.04em] md:text-7xl">{site.headline}</h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">{site.subheadline}</p>
          <p className="mt-6 max-w-xl rounded-2xl border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">Temukan {site.offer.toLowerCase()} pilihan, pahami detailnya, lalu pesan dari rumah lewat WhatsApp.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" render={<a href="${primaryActionHref}" target="_blank" rel="noreferrer" />}>
              <a href="${primaryActionHref}" target="_blank" rel="noreferrer">{site.primaryCta}</a>
            </Button>
            <a className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-5 text-sm font-medium text-foreground transition hover:bg-muted" href="#catalog">{site.secondaryCta}</a>
          </div>
        </div>
        <div className="relative mx-auto flex aspect-square w-full max-w-sm items-end justify-center overflow-hidden rounded-[2rem] border border-border bg-muted p-8 shadow-sm">
          <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-accent/20" />
          <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-primary/10" />
          <div className="relative flex h-full w-full flex-col justify-between rounded-3xl border border-border bg-background/70 p-6 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{site.businessName}</p>
            <div><p className="text-3xl font-semibold tracking-[-0.03em]">{site.offer}</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Pilihan yang mudah dilihat, ditanyakan, dan dipesan.</p></div>
          </div>
        </div>
      </section>
      <section id="catalog" className="border-t border-border px-6 py-16 md:px-12 md:py-20">
        <div className="mx-auto w-full max-w-6xl">
          {site.sections.map((section) => <article key={section.title} className="mb-10 max-w-2xl"><h2 className="text-3xl font-semibold tracking-[-0.03em]">{section.title}</h2><p className="mt-3 leading-relaxed text-muted-foreground">{section.body}</p></article>)}
          <div className="grid gap-5 sm:grid-cols-2">
            {site.products.map((product) => <article key={product.name} className="rounded-3xl border border-border bg-card p-6 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Koleksi pilihan</p><h3 className="mt-3 text-xl font-semibold">{product.name}</h3><p className="mt-2 leading-relaxed text-muted-foreground">{product.description}</p>{product.priceRange ? <p className="mt-4 text-sm font-medium">{product.priceRange}</p> : null}<Button size="lg" className="mt-6" render={<a href="${primaryActionHref}" target="_blank" rel="noreferrer" />}>{site.primaryCta}</Button></article>)}
          </div>
          <div className="mt-12 grid gap-4 rounded-3xl border border-border bg-muted/40 p-6 sm:grid-cols-3">
            {site.trustPoints.map((point) => <p key={point} className="text-sm font-medium leading-relaxed">{point}</p>)}
          </div>
          <div className="mt-12 rounded-3xl bg-primary p-8 text-primary-foreground md:p-12"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary-foreground/70">Langkah berikutnya</p><h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em]">Pilih yang kamu suka, lalu tanyakan detailnya.</h2><Button size="lg" variant="secondary" className="mt-6" render={<a href="${primaryActionHref}" target="_blank" rel="noreferrer" />}>{site.primaryCta}</Button></div>
          <div className="mt-12"><h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Alasan memilih kami</h2><div className="mt-4 grid gap-3 sm:grid-cols-3">{site.usp.map((item) => <p key={item} className="rounded-2xl border border-border px-5 py-4 text-sm text-muted-foreground">{item}</p>)}</div></div>
        </div>
      </section>
    </main>
  );
}
`;
}

export function compileGeneratedSiteWriterContractV2(input: {
  handoff: GeneratedSiteHandoffInput;
  briefSnapshot: ProjectBriefV2;
  photoEnabled: boolean;
  kit: GeneratedSiteDesignKitV1;
}): GeneratedSiteWriterContractV2 {
  const base = compileGeneratedSiteContract({
    contract: input.handoff.contract,
    plan: input.handoff.plan,
    briefSnapshot: input.briefSnapshot,
    photoEnabled: input.photoEnabled,
    recipe: recipeForV2(input.handoff.plan.archetype),
  });
  const mediaMode: Exclude<GeneratedSiteKitMediaMode, "replaceable_slots"> =
    input.photoEnabled && base.design.approvedAssets.length > 0
      ? "owner_assets"
      : input.kit.compatibleMediaModes.includes("graphic")
        ? "graphic"
        : "typographic";
  if (!input.kit.compatibleMediaModes.includes(mediaMode)) {
    throw new Error(
      `generated-site kit ${input.kit.id} cannot render media mode ${mediaMode}`,
    );
  }
  const sections = input.handoff.plan.pages.flatMap((page) =>
    page.sections.map((section) => ({
      id: section.id,
      purpose: section.purpose,
      requiredFactIds: section.requiredFactIds,
    })),
  );
  const draft = {
    schemaVersion: 2 as const,
    contractHash: "",
    handoff: {
      contractHash: input.handoff.contractHash,
      planHash: input.handoff.planHash,
    },
    business: base.business,
    content: base.content,
    obligations: {
      routes: input.handoff.plan.pages.map((page) => ({
        path: page.path,
        purpose: page.purpose,
        requiredFactIds: page.requiredFactIds,
        requiredSectionIds: page.sections.map((section) => section.id),
      })),
      sections,
      prohibitedClaims: input.handoff.contract.prohibitedClaims.map(
        (claim) => claim.statement,
      ),
    },
    media: {
      mode: mediaMode,
      approvedAssets: base.design.approvedAssets,
    },
    visualInputs: {
      direction: input.handoff.contract.preferences.visualDirection,
      density: densityForBrief(input.briefSnapshot),
      selectedKitId: input.kit.id,
      selectedKitVersion: 1 as const,
    },
  } satisfies Omit<GeneratedSiteWriterContractV2, "contractHash"> & {
    contractHash: string;
  };
  return {
    ...draft,
    contractHash: createHash("sha256")
      .update(HASH_PREFIX_V2 + canonicalJson(draft), "utf8")
      .digest("hex"),
  };
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
      headline: publicHeadline(input.briefSnapshot, input.plan.archetype),
      subheadline: publicSubheadline(input.briefSnapshot, primaryCta.label),
      offer:
        snapshotPrimaryOffer(input.briefSnapshot) ||
        products.map((item) => item.name).join(", "),
      promotion: input.briefSnapshot.content.currentPromo,
      trustPoints: publicTrustPoints(input.briefSnapshot, primaryCta.label),
      products: products.map(publicProductCopy),
      testimonials,
      faq: [],
      usp: publicTrustPoints(input.briefSnapshot, primaryCta.label),
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
      requiredSections: [
        ...input.plan.pages.flatMap((page) =>
          page.sections.map((section) => ({
            id: section.id,
            purpose: publicSectionPurpose(section.purpose, section.id),
            requiredContent: section.requiredFactIds,
          })),
        ),
        ...(input.plan.pages.some((page) =>
          page.sections.some((section) => section.id === "catalog"),
        ) || products.length === 0
          ? []
          : [
              { id: "catalog", purpose: "Pilihan produk", requiredContent: [] },
            ]),
      ],
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

function validateProfessionalObligationFacts(
  handoff: GeneratedSiteHandoffInput,
): void {
  const factIds = new Set(handoff.contract.facts.map((fact) => fact.id));
  const requiredFactIds = [
    ...handoff.plan.pages.flatMap((page) => page.requiredFactIds),
    ...handoff.plan.pages.flatMap((page) =>
      page.sections.flatMap((section) => section.requiredFactIds),
    ),
  ];
  for (const factId of requiredFactIds) {
    if (!factIds.has(factId)) {
      throw new Error(
        `professional site obligation references unknown fact: ${factId}`,
      );
    }
  }
}

function professionalMediaMode(
  input: GeneratedSiteWriterContractV3Input,
  kit: GeneratedSiteDesignKitV2,
): Exclude<GeneratedSiteKitMediaMode, "replaceable_slots"> {
  if (input.photoEnabled && input.handoff.contract.assets.length > 0) {
    if (!kit.compatibleMediaModes.includes("owner_assets")) {
      throw new Error(`professional site kit ${kit.id} rejects owner assets`);
    }
    return "owner_assets";
  }
  if (kit.compatibleMediaModes.includes("graphic")) {
    return "graphic";
  }
  if (kit.compatibleMediaModes.includes("typographic")) {
    return "typographic";
  }
  throw new Error(`professional site kit ${kit.id} has no no-asset media mode`);
}

function compileProfessionalCtaHref(input: {
  intent: BuildContractV1["ctaIntents"][number];
  targetFact: ContractFactV1 | undefined;
  facts: ContractFactV1[];
  plan: BuildPlanV1;
}): string {
  switch (input.intent.kind) {
    case "whatsapp":
      return contactHref(input.targetFact, "whatsapp");
    case "phone":
      return contactHref(input.targetFact, "phone");
    case "order":
    case "book":
      return contactHref(input.targetFact, input.intent.kind);
    case "visit":
      return visitHref(input.targetFact, input.facts, input.plan);
    case "browse":
      return findAcceptedSectionOrRouteHref(
        input.plan,
        /catalog|katalog|menu|produk|kelas|pilihan/i,
      );
    case "other":
      return acceptedActionTarget(input.targetFact);
    default:
      throw new Error(
        `professional site CTA kind is unsupported: ${input.intent.kind}`,
      );
  }
}

function contactHref(
  fact: ContractFactV1 | undefined,
  kind: "whatsapp" | "phone" | "book" | "order",
): string {
  if (!fact || fact.kind !== "contact") {
    throw new Error(
      `professional site ${kind} CTA requires an accepted contact fact`,
    );
  }
  const value = fact.value.value.trim();
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7) {
    throw new Error("professional site contact target is unsafe");
  }
  if (kind === "whatsapp") {
    const normalized = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
    return `https://wa.me/${normalized}`;
  }
  return `tel:+${digits.startsWith("0") ? `62${digits.slice(1)}` : digits}`;
}

function visitHref(
  targetFact: ContractFactV1 | undefined,
  facts: ContractFactV1[],
  plan: BuildPlanV1,
): string {
  if (targetFact?.kind === "contact" && targetFact.value.channel === "maps") {
    return acceptedActionTarget(targetFact);
  }
  if (targetFact?.kind === "address") {
    try {
      return findAcceptedSectionOrRouteHref(
        plan,
        /contact|kontak|lokasi|address|alamat|operat/i,
      );
    } catch {
      return "#contact";
    }
  }
  const addressFacts = facts.filter((fact) => fact.kind === "address");
  const mapFacts = facts.filter(
    (fact) => fact.kind === "contact" && fact.value.channel === "maps",
  );
  if (addressFacts.length + mapFacts.length !== 1) {
    throw new Error("professional site visit CTA target is ambiguous");
  }
  const fact = addressFacts[0] ?? mapFacts[0];
  return visitHref(fact, facts, plan);
}

function acceptedActionTarget(fact: ContractFactV1 | undefined): string {
  if (!fact) {
    throw new Error("professional site action target is missing");
  }
  const raw =
    fact.kind === "contact"
      ? fact.value.value.trim()
      : fact.kind === "other"
        ? fact.value.trim()
        : "";
  if (!raw || raw === "#kontak") {
    throw new Error("professional site action target is unsafe");
  }
  if (raw.startsWith("/")) {
    return normalizeHashHistoryHref(raw);
  }
  if (raw.startsWith("#")) {
    if (!/^#[a-z0-9-]+$/i.test(raw)) {
      throw new Error("professional site action target is unsafe");
    }
    return raw;
  }
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("professional site action target is unsafe");
  }
  if (url.username || url.password) {
    throw new Error("professional site action target is unsafe");
  }
  return url.toString();
}

function findAcceptedSectionOrRouteHref(
  plan: BuildPlanV1,
  matcher: RegExp,
): string {
  const sectionMatches = plan.pages.flatMap((page) =>
    page.sections.filter((section) =>
      matcher.test(`${section.id} ${section.purpose}`),
    ),
  );
  const sectionIds = [...new Set(sectionMatches.map((section) => section.id))];
  if (sectionIds.length === 1) {
    return `#${sectionIds[0]}`;
  }
  const routeMatches = plan.pages.filter((page) =>
    matcher.test(`${page.id} ${page.purpose}`),
  );
  if (routeMatches.length === 1) {
    return normalizeHashHistoryHref(routeMatches[0].path);
  }
  throw new Error("professional site action target is missing or ambiguous");
}

function compileAcceptedSecondaryHref(input: {
  action: string;
  plan: BuildPlanV1;
  primaryCta: ProfessionalSiteContentV1["primaryCta"];
}): string | null {
  const action = input.action.trim();
  if (!action) {
    return null;
  }
  if (action === "browse") {
    try {
      return findAcceptedSectionOrRouteHref(
        input.plan,
        /catalog|katalog|menu|produk|kelas|pilihan/i,
      );
    } catch {
      return null;
    }
  }
  if (action === "visit" || action === "maps") {
    try {
      return findAcceptedSectionOrRouteHref(
        input.plan,
        /contact|kontak|lokasi|address|alamat|operat/i,
      );
    } catch {
      return null;
    }
  }
  if (action === input.primaryCta.intentId) {
    return input.primaryCta.href;
  }
  if (action.startsWith("/") || action.startsWith("#")) {
    return normalizeHashHistoryHref(action);
  }
  try {
    const url = new URL(action);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function compileAcceptedNavigation(
  plan: BuildPlanV1,
): ProfessionalSiteContentV1["navigation"] {
  const pagesById = new Map(plan.pages.map((page) => [page.id, page]));
  const edges = new Set<string>();
  return plan.navigation.map((navigation) => {
    const fromPage = pagesById.get(navigation.fromPageId);
    const toPage = pagesById.get(navigation.toPageId);
    const label = navigation.label.trim();
    if (!fromPage || !toPage || !label || /[<>]/.test(label)) {
      throw new Error("professional site navigation is invalid");
    }
    const edge = `${fromPage.path}->${toPage.path}`;
    if (edges.has(edge)) {
      throw new Error("professional site navigation contains duplicate edge");
    }
    edges.add(edge);
    return {
      fromPath: normalizeStaticPath(fromPage.path),
      toPath: normalizeStaticPath(toPage.path),
      label,
      href: normalizeHashHistoryHref(toPage.path),
    };
  });
}

function normalizeStaticPath(path: string): string {
  if (path.includes(":")) {
    throw new Error("dynamic routes are unsupported");
  }
  if (path.includes("*")) {
    throw new Error("wildcard routes are unsupported");
  }
  if (path === "/") {
    return path;
  }
  if (!/^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(path)) {
    throw new Error(`unsafe route path: ${path}`);
  }
  return path;
}

function normalizeHashHistoryHref(path: string): string {
  if (path.startsWith("#")) {
    if (!/^#[a-z0-9-]+$/i.test(path)) {
      throw new Error("professional site internal target is unsafe");
    }
    return path;
  }
  return `#${normalizeStaticPath(path)}`;
}

function acceptedOfferFacts(facts: ContractFactV1[]): SiteSchemaProduct[] {
  return facts.flatMap((fact) =>
    fact.kind === "offer" ? fact.value.map((item) => ({ ...item })) : [],
  );
}

function acceptedTestimonialFacts(facts: ContractFactV1[]): TestimonialValue[] {
  return facts.flatMap((fact) =>
    fact.kind === "testimonial" ? fact.value : [],
  );
}

function acceptedCertificationFacts(
  facts: ContractFactV1[],
): CertificationValue[] {
  return facts.flatMap((fact) =>
    fact.kind === "certification" ? fact.value : [],
  );
}

function acceptedHoursFacts(facts: ContractFactV1[]): HoursValue[] {
  return facts.flatMap((fact) => (fact.kind === "hours" ? fact.value : []));
}

function acceptedPaymentFacts(facts: ContractFactV1[]): PaymentMethodValue[] {
  return facts.flatMap((fact) =>
    fact.kind === "payment_method" ? fact.value : [],
  );
}

function acceptedSocialFacts(facts: ContractFactV1[]): SocialLinkValue[] {
  return facts.flatMap((fact) =>
    fact.kind === "social_link" ? fact.value : [],
  );
}

function acceptedOtherFacts(facts: ContractFactV1[]): string[] {
  return facts.flatMap((fact) => (fact.kind === "other" ? [fact.value] : []));
}

function acceptedArrayFacts(
  facts: ContractFactV1[],
  kind: "testimonial",
): TestimonialValue[];
function acceptedArrayFacts(
  facts: ContractFactV1[],
  kind: "certification",
): CertificationValue[];
function acceptedArrayFacts(
  facts: ContractFactV1[],
  kind: "hours",
): HoursValue[];
function acceptedArrayFacts(
  facts: ContractFactV1[],
  kind: "payment_method",
): PaymentMethodValue[];
function acceptedArrayFacts(
  facts: ContractFactV1[],
  kind: "social_link",
): SocialLinkValue[];
function acceptedArrayFacts(facts: ContractFactV1[], kind: "other"): string[];
function acceptedArrayFacts(
  facts: ContractFactV1[],
  kind: FactKind,
): Array<unknown> {
  switch (kind) {
    case "testimonial":
      return acceptedTestimonialFacts(facts);
    case "certification":
      return acceptedCertificationFacts(facts);
    case "hours":
      return acceptedHoursFacts(facts);
    case "payment_method":
      return acceptedPaymentFacts(facts);
    case "social_link":
      return acceptedSocialFacts(facts);
    case "other":
      return acceptedOtherFacts(facts);
    default:
      return [];
  }
}

function acceptedAddressText(facts: ContractFactV1[]): string | null {
  const values = facts
    .filter((fact) => fact.kind === "address")
    .map((fact) =>
      [fact.value.line1, fact.value.city, fact.value.postalCode]
        .filter(Boolean)
        .join(", "),
    )
    .filter(Boolean);
  return values.length === 1
    ? (values[0] ?? null)
    : values.length > 1
      ? values.join("; ")
      : null;
}

function acceptedServiceAreaText(facts: ContractFactV1[]): string | null {
  const values = facts.flatMap((fact) =>
    fact.kind === "service_area" ? fact.value.map((item) => item.area) : [],
  );
  return values.length ? values.join(", ") : null;
}

function duplicateIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.add(id);
    }
    seen.add(id);
  }
  return [...duplicates];
}

function recipeForV2(archetype: string): GeneratedSiteRecipeV1 {
  const recipeById: Record<string, GeneratedSiteRecipeV1> = {
    "retail-catalog": {
      id: "retail-catalog",
      version: 1,
      compatibleArchetypes: [archetype],
      composition: "Catalog-first composition.",
      hierarchy: ["offer", "catalog", "trust", "action"],
      preferredPatterns: ["catalog comparison"],
      avoidPatterns: [],
      mediaGuidance: {
        owner_assets: "Use approved owner assets.",
        replaceable_slots: "Not used in V2.",
        graphic: "Use local graphic composition.",
        typographic: "Use typography-led composition.",
      },
      imageBenefiting: false,
      requiredBrowserAssertions: [],
      riskTags: [],
    },
    generic: {
      id: "generic",
      version: 1,
      compatibleArchetypes: [archetype],
      composition: "Job-first composition.",
      hierarchy: ["identity", "details", "trust", "action"],
      preferredPatterns: ["content-led hero"],
      avoidPatterns: [],
      mediaGuidance: {
        owner_assets: "Use approved owner assets.",
        replaceable_slots: "Not used in V2.",
        graphic: "Use local graphic composition.",
        typographic: "Use typography-led composition.",
      },
      imageBenefiting: false,
      requiredBrowserAssertions: [],
      riskTags: [],
    },
  };
  return recipeById[archetype] ?? recipeById.generic;
}

function densityForBrief(
  snapshot: ProjectBriefV2,
): "sparse" | "regular" | "rich" {
  const detailCount =
    snapshot.offers.length +
    snapshot.content.usp.length +
    snapshot.content.testimonials.length +
    snapshot.content.socialLinks.length +
    snapshot.content.paymentMethods.length +
    snapshot.content.hours.length;
  if (detailCount >= 8) {
    return "rich";
  }
  if (detailCount >= 3) {
    return "regular";
  }
  return "sparse";
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
    // Fall back to any available contact fact if the specific targetFactId is missing
    const anyContact = facts.find((item) => item.kind === "contact");
    if (anyContact && anyContact.kind === "contact") {
      return anyContact.value.value;
    }
    return "#kontak";
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

function publicHeadline(snapshot: ProjectBriefV2, _archetype: string): string {
  const tagline = snapshot.content.tagline?.trim();
  if (tagline && !isInternalCopy(tagline)) {
    return tagline;
  }
  return snapshotPrimaryOffer(snapshot) ?? snapshot.business.name?.trim() ?? "";
}

function publicSectionPurpose(purpose: string, id: string): string {
  if (/intro|primary cta|hero/i.test(purpose) || id === "hero") {
    return "Temukan koleksi pilihan";
  }
  if (/catalog|produk/i.test(purpose) || id === "catalog") {
    return "Pilihan koleksi";
  }
  if (/contact|kontak/i.test(purpose) || id === "contact") {
    return "Hubungi kami";
  }
  return purpose;
}

function publicSubheadline(
  snapshot: ProjectBriefV2,
  _ctaLabel: string,
): string {
  return snapshot.audience?.trim() ?? snapshotPrimaryOffer(snapshot) ?? "";
}

function publicTrustPoints(
  snapshot: ProjectBriefV2,
  _ctaLabel: string,
): string[] {
  const supplied = snapshot.content.usp
    ?.map((item) => item.trim())
    .filter(Boolean);
  if (supplied?.length) {
    return supplied;
  }
  return [];
}

function publicProductCopy(product: SiteSchemaProduct): SiteSchemaProduct {
  const description = product.description?.trim();
  if (!description || isInternalCopy(description)) {
    const { description: _description, ...withoutDescription } = product;
    return withoutDescription;
  }
  return product;
}

function isInternalCopy(value: string): boolean {
  return /katalog jadi hero|fitur disederhanakan|info jelas|online murni|produk utama katalog|tujuan utama/i.test(
    value,
  );
}

function whatsappHref(target: string): string {
  const digits = target.replace(/\D/g, "");
  const phone = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return `https://wa.me/${phone}?text=Halo`;
}
