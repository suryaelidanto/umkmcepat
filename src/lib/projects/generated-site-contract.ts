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

export function createGeneratedSiteRouteSource(
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
            <Button asChild size="lg">
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
            {site.products.map((product) => <article key={product.name} className="rounded-3xl border border-border bg-card p-6 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Koleksi pilihan</p><h3 className="mt-3 text-xl font-semibold">{product.name}</h3><p className="mt-2 leading-relaxed text-muted-foreground">{product.description}</p>{product.priceRange ? <p className="mt-4 text-sm font-medium">{product.priceRange}</p> : null}<Button asChild size="lg" className="mt-6"><a href="${primaryActionHref}" target="_blank" rel="noreferrer">{site.primaryCta}</a></Button></article>)}
          </div>
          <div className="mt-12 grid gap-4 rounded-3xl border border-border bg-muted/40 p-6 sm:grid-cols-3">
            {site.trustPoints.map((point) => <p key={point} className="text-sm font-medium leading-relaxed">{point}</p>)}
          </div>
          <div className="mt-12 rounded-3xl bg-primary p-8 text-primary-foreground md:p-12"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary-foreground/70">Langkah berikutnya</p><h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em]">Pilih yang kamu suka, lalu tanyakan detailnya.</h2><Button asChild size="lg" variant="secondary" className="mt-6"><a href="${primaryActionHref}" target="_blank" rel="noreferrer">{site.primaryCta}</a></Button></div>
          <div className="mt-12"><h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Alasan memilih kami</h2><div className="mt-4 grid gap-3 sm:grid-cols-3">{site.usp.map((item) => <p key={item} className="rounded-2xl border border-border px-5 py-4 text-sm text-muted-foreground">{item}</p>)}</div></div>
        </div>
      </section>
    </main>
  );
}
`;
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

function publicHeadline(snapshot: ProjectBriefV2, archetype: string): string {
  const tagline = snapshot.content.tagline?.trim();
  if (tagline && !isInternalCopy(tagline)) {
    return tagline;
  }
  const offer = snapshotPrimaryOffer(snapshot) ?? "pilihan utama";
  if (archetype.startsWith("retail")) {
    return `Pilih ${offer} dengan lebih mudah`;
  }
  return `${offer} yang mudah dipahami dan dipesan`;
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

function publicSubheadline(snapshot: ProjectBriefV2, ctaLabel: string): string {
  const offer = snapshotPrimaryOffer(snapshot) ?? "pilihan utama";
  const audience = snapshot.audience?.trim();
  const audienceText = audience ? ` untuk ${audience.toLowerCase()}` : "";
  return `Lihat pilihan ${offer}${audienceText}, pahami detailnya, lalu ${ctaLabel.toLowerCase()} saat sudah siap.`;
}

function publicTrustPoints(
  snapshot: ProjectBriefV2,
  ctaLabel: string,
): string[] {
  const supplied = snapshot.content.usp
    ?.map((item) => item.trim())
    .filter(Boolean);
  if (supplied?.length) {
    return supplied;
  }
  return [
    "Pilihan utama terlihat jelas",
    "Detail produk mudah dipahami",
    `${ctaLabel} mudah ditemukan`,
  ];
}

function publicProductCopy(product: SiteSchemaProduct): SiteSchemaProduct {
  const description = product.description?.trim();
  if (!description || isInternalCopy(description)) {
    return {
      ...product,
      description: "Pilihan utama yang bisa kamu tanyakan sebelum pesan.",
    };
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
