import type { ProjectBrief } from "@/lib/projects/brief";
import type { BuildContractV1 } from "@/lib/projects/build-contract";
import type { BuildPlanV1 } from "@/lib/projects/build-plan";
import type { ProjectBriefV2 } from "@/lib/projects/canonical-brief";

import {
  type HoursValue,
  type PaymentMethodValue,
  type SocialLinkValue,
} from "@/lib/projects/brief-rich-fields";

export type SiteSchemaProduct = {
  name: string;
  description?: string;
  priceRange?: string;
};

export type SiteSchemaFaqItem = {
  q: string;
  a: string;
};

export type ProjectSiteSchema = {
  version: 1;
  businessName: string;
  eyebrow: string;
  headline: string;
  subheadline: string;
  primaryCta: string;
  secondaryCta: string;
  audience: string;
  offer: string;
  theme: {
    background: string;
    foreground: string;
    muted: string;
    accent: string;
  };
  trustPoints: string[];
  sections: Array<{
    title: string;
    body: string;
  }>;
  // Rich fields — optional, populated from brief when the owner provided them.
  tagline?: string;
  usp?: string[];
  products?: SiteSchemaProduct[];
  testimonials?: Array<{
    quote: string;
    author: string;
    rating?: 1 | 2 | 3 | 4 | 5;
  }>;
  faq?: SiteSchemaFaqItem[];
  socialLinks?: SocialLinkValue[];
  currentPromo?: string;
  hours?: HoursValue[];
  paymentMethods?: PaymentMethodValue[];
  priceRange?: string;
  address?: string;
  deliveryArea?: string;
  since?: string;
  primaryCtaTarget?: string;
  images?: Array<{
    url: string;
    purpose?: string;
    alt?: string;
  }>;
  contact?: {
    channel: string;
    value: string;
  };
  routes?: Array<{
    path: string;
    title: string;
  }>;
};

const MAX_TEXT = 220;
const MAX_SECTIONS = 5;
const MAX_TRUST_POINTS = 4;
const MAX_PRODUCTS = 12;
const MAX_TESTIMONIALS = 8;
const MAX_FAQ = 10;
const MAX_USP = 6;
const MAX_SOCIAL = 6;
const MAX_HOURS = 7;
const MAX_PAYMENTS = 8;
const defaultTheme = {
  background: "#f6f7f4",
  foreground: "#111312",
  muted: "#6b706d",
  accent: "#f05a28",
};

function cleanText(value: unknown, fallback: string, maxLength = MAX_TEXT) {
  if (typeof value !== "string") {
    return fallback;
  }

  const text = value.trim().replace(/\s+/g, " ");
  if (!text) {
    return fallback;
  }
  if (text.length <= maxLength) {
    return text;
  }
  // A hard slice can land mid-word with no signal it was cut — reads as
  const truncated = text.slice(0, maxLength - 1);
  const lastSpace = truncated.lastIndexOf(" ");
  const wordSafe = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return `${wordSafe}…`;
}

function cleanHex(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const text = value.trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
}

function cleanList(value: unknown, fallback: string[], maxItems: number) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value
    .map((item) => cleanText(item, "", 90))
    .filter(Boolean)
    .slice(0, maxItems);

  return items.length ? items : fallback;
}

export function createFallbackProjectSiteSchema(
  prompt: string,
): ProjectSiteSchema {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  const businessName = normalized
    ? normalized.slice(0, 64)
    : "Website UMKM Kamu";

  return {
    version: 1,
    businessName,
    eyebrow: "Website usaha",
    headline: businessName,
    subheadline:
      "Website sederhana untuk menjelaskan usaha, membangun rasa percaya, dan membantu pelanggan menghubungi kamu.",
    primaryCta: "Hubungi kami",
    secondaryCta: "Lihat detail",
    audience: "Pelanggan baru",
    offer: "Produk dan layanan usaha",
    theme: defaultTheme,
    trustPoints: ["Info jelas", "Mudah dihubungi", "Siap dibuka dari HP"],
    sections: [
      {
        title: "Tentang usaha",
        body: "Ceritakan produk, layanan, dan alasan pelanggan memilih usahamu.",
      },
      {
        title: "Untuk pelanggan",
        body: "Tampilkan informasi penting agar pelanggan cepat paham dan mudah mengambil langkah berikutnya.",
      },
      {
        title: "Cara memesan",
        body: "Arahkan pelanggan untuk menghubungi kamu lewat tombol atau kontak yang tersedia.",
      },
    ],
  };
}

export function buildContextualWhatsAppHref(
  rawPhone: string,
  businessName?: string,
  offer?: string,
): string {
  const digits = rawPhone.replace(/\D/g, "");
  const normalizedPhone = digits.startsWith("0")
    ? `62${digits.slice(1)}`
    : digits;
  const name = (businessName ?? "").trim();
  const mainOffer = (offer ?? "").trim();

  let message = "Halo";
  if (name && mainOffer) {
    message = `Halo ${name}, saya mau tanya info dan pesan ${mainOffer}.`;
  } else if (name) {
    message = `Halo ${name}, saya mau tanya informasi dan pemesanan.`;
  } else if (mainOffer) {
    message = `Halo, saya mau tanya informasi mengenai ${mainOffer}.`;
  } else {
    message = "Halo, saya tertarik dan ingin tanya informasi lebih lanjut.";
  }

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

export function createProjectSiteSchemaFromBrief(
  brief: ProjectBrief,
): ProjectSiteSchema {
  const businessName = cleanText(brief.businessName, "Website usaha", 80);
  const products = briefProducts(brief);
  const offer = cleanText(brief.offer || products?.[0]?.name, "", 120);
  const audience = cleanText(brief.targetCustomer, "", 140);
  const contactLabel = cleanText(
    brief.contact?.label || brief.contactOrCta,
    "Hubungi usaha",
    44,
  );
  const sections = [
    offer ? { title: "Penawaran", body: offer } : null,
    audience ? { title: "Pelanggan", body: audience } : null,
    contactLabel ? { title: "Hubungi usaha", body: contactLabel } : null,
  ].filter(
    (section): section is { title: string; body: string } => section !== null,
  );

  return {
    version: 1,
    businessName,
    eyebrow: cleanText(brief.businessType, "Usaha", 60),
    headline: businessName || offer,
    subheadline: cleanText(brief.tagline, offer, 260),
    primaryCta: contactLabel,
    secondaryCta: cleanText(brief.secondaryCta?.label, "", 44),
    audience,
    offer,
    theme: defaultTheme,
    trustPoints:
      brief.usp
        ?.map((value) => value.trim())
        .filter(Boolean)
        .slice(0, MAX_TRUST_POINTS) ?? [],
    sections,
    tagline: brief.tagline?.trim() || undefined,
    usp:
      brief.usp
        ?.map((value) => value.trim())
        .filter(Boolean)
        .slice(0, MAX_USP) || undefined,
    products,
    testimonials: briefTestimonials(brief),
    faq: [],
    socialLinks:
      brief.socialLinks && brief.socialLinks.length
        ? brief.socialLinks.slice(0, MAX_SOCIAL)
        : undefined,
    currentPromo: brief.currentPromo?.trim() || undefined,
    hours:
      brief.hours && brief.hours.length
        ? brief.hours.slice(0, MAX_HOURS)
        : undefined,
    paymentMethods:
      brief.paymentMethods && brief.paymentMethods.length
        ? brief.paymentMethods.slice(0, MAX_PAYMENTS)
        : undefined,
    priceRange: brief.priceRange?.trim() || undefined,
    address: brief.address?.trim() || undefined,
    deliveryArea: brief.deliveryArea?.trim() || undefined,
    images:
      brief.businessImages && brief.businessImages.length > 0
        ? Array.from(
            new Map(
              brief.businessImages.map((img) => [
                img.id,
                {
                  url: `/api/media/${img.id}`,
                  purpose: img.purpose || "business-image",
                  alt: businessName,
                },
              ]),
            ).values(),
          )
        : undefined,
    primaryCtaTarget:
      brief.contact?.channel === "whatsapp" && brief.contact?.value
        ? buildContextualWhatsAppHref(brief.contact.value, businessName, offer)
        : undefined,
    contact:
      brief.contact?.channel && brief.contact?.value
        ? {
            channel: brief.contact.channel,
            value: brief.contact.value,
          }
        : undefined,
  };
}

export function createProjectSiteSchemaFromAcceptedHandoff(input: {
  briefSnapshot: ProjectBriefV2;
  contract: BuildContractV1;
  plan: BuildPlanV1;
}): ProjectSiteSchema {
  const contract = input.contract;
  const businessName = cleanText(contract.identity.businessName, "Usaha", 80);
  const offerFact = findContractFact(contract, "offer");
  const contractOffers = offerFact?.kind === "offer" ? offerFact.value : [];
  const offer = cleanText(
    contractOffers.find((item) => item.isPrimary)?.name ||
      contractOffers[0]?.name,
    "",
    120,
  );
  const tagline = contractStringFact(contract, "tagline");
  const audience = contractStringFact(contract, "audience");
  const usp = contractArrayFact(contract, "usp");
  const contactFact = findContractFact(contract, "contact");
  const contact = contactFact?.kind === "contact" ? contactFact.value : null;
  const primaryCta = cleanText(
    contract.ctaIntents[0]?.label || contact?.label,
    "",
    44,
  );
  const priceFact = findContractFact(contract, "price");
  const priceRange =
    priceFact?.kind === "price"
      ? priceFact.value[0]?.amount?.trim()
      : undefined;
  const serviceAreaFact = findContractFact(contract, "service_area");
  const deliveryArea =
    serviceAreaFact?.kind === "service_area"
      ? serviceAreaFact.value[0]?.area?.trim()
      : undefined;
  const addressFact = findContractFact(contract, "address");
  const address =
    addressFact?.kind === "address" ? addressFact.value.line1 : undefined;
  const secondaryFact = findContractFact(contract, "secondary_action");
  const secondaryCta =
    secondaryFact?.kind === "secondary_action"
      ? secondaryFact.value.label
      : undefined;
  const seenAssetIds = new Set<string>();
  const images = contract.assets
    .filter((asset) => {
      if (seenAssetIds.has(asset.assetId)) {
        return false;
      }
      seenAssetIds.add(asset.assetId);
      return true;
    })
    .map((asset) => ({
      url: `/api/media/${asset.assetId}`,
      purpose: asset.approvedPurpose,
      alt: businessName,
    }));

  const schema: ProjectSiteSchema = {
    version: 1,
    businessName,
    eyebrow: cleanText(contract.identity.businessType, "Usaha", 60),
    headline: businessName || offer,
    subheadline: cleanText(tagline, offer, 260),
    primaryCta,
    secondaryCta: cleanText(secondaryCta, "", 44),
    audience: cleanText(audience, "", 140),
    offer,
    theme: defaultTheme,
    trustPoints: usp.slice(0, MAX_TRUST_POINTS),
    sections: [],
    ...(tagline ? { tagline } : {}),
    ...(usp.length ? { usp: usp.slice(0, MAX_USP) } : {}),
    ...(contractOffers.length
      ? {
          products: contractOffers
            .map((item) => ({
              name: item.name.trim(),
              description: item.description?.trim() || undefined,
              priceRange: item.priceRange?.trim() || undefined,
            }))
            .filter((item) => item.name)
            .slice(0, MAX_PRODUCTS),
        }
      : {}),
    ...(priceRange ? { priceRange } : {}),
    ...(deliveryArea ? { deliveryArea } : {}),
    ...(address ? { address } : {}),
    ...(contractStringFact(contract, "since")
      ? { since: contractStringFact(contract, "since") }
      : {}),
    ...(contact
      ? {
          contact: { channel: contact.channel, value: contact.value },
          ...(contact.channel === "whatsapp"
            ? {
                primaryCtaTarget: buildContextualWhatsAppHref(
                  contact.value,
                  businessName,
                  offer,
                ),
              }
            : {}),
        }
      : {}),
    images,
    routes: input.plan.pages.map((page) => ({
      path: page.path,
      title: page.title,
    })),
  };

  const hoursFact = findContractFact(contract, "hours");
  if (hoursFact?.kind === "hours" && hoursFact.value.length) {
    schema.hours = hoursFact.value.slice(0, MAX_HOURS);
  }
  const paymentsFact = findContractFact(contract, "payment_method");
  if (paymentsFact?.kind === "payment_method" && paymentsFact.value.length) {
    schema.paymentMethods = paymentsFact.value.slice(0, MAX_PAYMENTS);
  }
  const testimonialsFact = findContractFact(contract, "testimonial");
  if (
    testimonialsFact?.kind === "testimonial" &&
    testimonialsFact.value.length
  ) {
    schema.testimonials = testimonialsFact.value
      .map((testimonial) => ({
        quote: testimonial.quote,
        author: testimonial.author,
        rating: testimonial.rating,
      }))
      .slice(0, MAX_TESTIMONIALS);
  }
  const socialFact = findContractFact(contract, "social_link");
  if (socialFact?.kind === "social_link" && socialFact.value.length) {
    schema.socialLinks = socialFact.value.slice(0, MAX_SOCIAL);
  }
  const promotionFact = findContractFact(contract, "promotion");
  if (promotionFact?.kind === "promotion") {
    schema.currentPromo = promotionFact.value[0]?.title;
  }

  return schema;
}

function findContractFact<K extends BuildContractV1["facts"][number]["kind"]>(
  contract: BuildContractV1,
  kind: K,
): Extract<BuildContractV1["facts"][number], { kind: K }> | undefined {
  return contract.facts.find(
    (fact): fact is Extract<BuildContractV1["facts"][number], { kind: K }> =>
      fact.kind === kind,
  );
}

function contractStringFact(
  contract: BuildContractV1,
  kind: "audience" | "tagline" | "since",
): string | undefined {
  const fact = findContractFact(contract, kind);
  return fact?.kind === kind ? fact.value.trim() || undefined : undefined;
}

function contractArrayFact(contract: BuildContractV1, kind: "usp"): string[] {
  const fact = findContractFact(contract, kind);
  return fact?.kind === kind
    ? fact.value.map((value) => value.trim()).filter(Boolean)
    : [];
}

function briefProducts(brief: ProjectBrief): SiteSchemaProduct[] | undefined {
  if (!brief.productOrService || !brief.productOrService.length) {
    return undefined;
  }
  const items = brief.productOrService
    .map((item) => ({
      name: item.name.trim(),
      description: item.description?.trim() || undefined,
      priceRange: item.priceRange?.trim() || undefined,
    }))
    .filter((p) => p.name)
    .slice(0, MAX_PRODUCTS);
  return items.length ? items : undefined;
}

function briefTestimonials(
  brief: ProjectBrief,
): ProjectSiteSchema["testimonials"] | undefined {
  if (!brief.testimonials || !brief.testimonials.length) {
    return undefined;
  }
  const items = brief.testimonials
    .map((t) => ({
      quote: t.quote.trim(),
      author: t.author.trim(),
      rating: t.rating,
    }))
    .filter((t) => t.quote && t.author)
    .slice(0, MAX_TESTIMONIALS);
  return items.length ? items : undefined;
}

export function parseProjectSiteSchema(
  value: unknown,
  fallbackInput: ProjectSiteSchema | string = "",
): ProjectSiteSchema {
  const fallback =
    typeof fallbackInput === "string"
      ? createFallbackProjectSiteSchema(fallbackInput)
      : fallbackInput;

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const data = value as Record<string, unknown>;
  const rawTheme =
    data.theme && typeof data.theme === "object"
      ? (data.theme as Record<string, unknown>)
      : {};
  const rawSections = Array.isArray(data.sections) ? data.sections : [];
  const sections = rawSections.slice(0, MAX_SECTIONS).map((section, index) => {
    const item =
      section && typeof section === "object"
        ? (section as Record<string, unknown>)
        : {};
    const fallbackSection = fallback.sections[index] ?? fallback.sections[0];

    return {
      title: cleanText(item.title, fallbackSection.title, 80),
      body: cleanText(item.body, fallbackSection.body, 260),
    };
  });

  return {
    version: 1,
    businessName: cleanText(data.businessName, fallback.businessName, 80),
    eyebrow: cleanText(data.eyebrow, fallback.eyebrow, 60),
    headline: cleanText(data.headline, fallback.headline, 110),
    subheadline: cleanText(data.subheadline, fallback.subheadline, 260),
    primaryCta: cleanText(data.primaryCta, fallback.primaryCta, 44),
    secondaryCta: cleanText(data.secondaryCta, fallback.secondaryCta, 44),
    audience: cleanText(data.audience, fallback.audience, 80),
    offer: cleanText(data.offer, fallback.offer, 100),
    theme: {
      background: cleanHex(rawTheme.background, fallback.theme.background),
      foreground: cleanHex(rawTheme.foreground, fallback.theme.foreground),
      muted: cleanHex(rawTheme.muted, fallback.theme.muted),
      accent: cleanHex(rawTheme.accent, fallback.theme.accent),
    },
    trustPoints: cleanList(
      data.trustPoints,
      fallback.trustPoints,
      MAX_TRUST_POINTS,
    ),
    sections: sections.length ? sections : fallback.sections,
    // Rich fields: round-trip only when the AI wrote them into site.ts.
    tagline: cleanOptional(data.tagline, fallback.tagline, 160),
    usp: cleanOptionalList(data.usp, fallback.usp, MAX_USP),
    products: parseProductsField(data.products, fallback.products),
    testimonials: parseTestimonialsField(
      data.testimonials,
      fallback.testimonials,
    ),
    faq: parseFaqField(data.faq, fallback.faq),
    socialLinks: parseSocialLinksField(data.socialLinks, fallback.socialLinks),
    currentPromo: cleanOptional(data.currentPromo, fallback.currentPromo, 220),
    hours: parseHoursField(data.hours, fallback.hours),
    paymentMethods: parsePaymentsField(
      data.paymentMethods,
      fallback.paymentMethods,
    ),
    priceRange: cleanOptional(data.priceRange, fallback.priceRange, 80),
    address: cleanOptional(data.address, fallback.address, 160),
    deliveryArea: cleanOptional(data.deliveryArea, fallback.deliveryArea, 120),
    since: cleanOptional(data.since, fallback.since, 40),
    primaryCtaTarget: cleanOptional(
      data.primaryCtaTarget,
      fallback.primaryCtaTarget,
      500,
    ),
    contact: parseContactField(data.contact, fallback.contact),
    images: parseImagesField(data.images, fallback.images),
    routes: parseRoutesField(data.routes, fallback.routes),
  };
}

function parseContactField(
  value: unknown,
  fallback: ProjectSiteSchema["contact"],
): ProjectSiteSchema["contact"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  const input = value as Record<string, unknown>;
  const channel = typeof input.channel === "string" ? input.channel.trim() : "";
  const contactValue =
    typeof input.value === "string" ? input.value.trim() : "";
  return channel && contactValue ? { channel, value: contactValue } : fallback;
}

function parseImagesField(
  value: unknown,
  fallback: ProjectSiteSchema["images"],
): ProjectSiteSchema["images"] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const images = value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const input = item as Record<string, unknown>;
      const url = typeof input.url === "string" ? input.url.trim() : "";
      if (
        !url ||
        (!url.startsWith("/api/media/") && !url.startsWith("/media/"))
      ) {
        return null;
      }
      return {
        url,
        purpose: typeof input.purpose === "string" ? input.purpose : undefined,
        alt:
          typeof input.alt === "string"
            ? input.alt.trim() || undefined
            : undefined,
      };
    })
    .filter(
      (
        item,
      ): item is {
        url: string;
        purpose: string | undefined;
        alt: string | undefined;
      } => item !== null,
    )
    .slice(0, 12);
  return images.length ? images : fallback;
}

function parseRoutesField(
  value: unknown,
  fallback: ProjectSiteSchema["routes"],
): ProjectSiteSchema["routes"] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const routes = value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const input = item as Record<string, unknown>;
      const path = typeof input.path === "string" ? input.path.trim() : "";
      const title = typeof input.title === "string" ? input.title.trim() : "";
      return path && title ? { path, title } : null;
    })
    .filter((item): item is { path: string; title: string } => item !== null)
    .slice(0, 12);
  return routes.length ? routes : fallback;
}

function cleanOptional(
  value: unknown,
  fallback: string | undefined,
  maxLength: number,
): string | undefined {
  if (typeof value === "string") {
    const text = value.trim().replace(/\s+/g, " ");
    return text ? text.slice(0, maxLength) : undefined;
  }
  return fallback;
}

function cleanOptionalList(
  value: unknown,
  fallback: string[] | undefined,
  maxItems: number,
): string[] | undefined {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, maxItems);
  return items.length ? items : fallback;
}

function parseProductsField(
  value: unknown,
  fallback: SiteSchemaProduct[] | undefined,
): SiteSchemaProduct[] | undefined {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const items = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const obj = item as Record<string, unknown>;
      const name = typeof obj.name === "string" ? obj.name.trim() : "";
      if (!name) {
        return null;
      }
      const description =
        typeof obj.description === "string"
          ? obj.description.trim() || undefined
          : undefined;
      const priceRange =
        typeof obj.priceRange === "string"
          ? obj.priceRange.trim() || undefined
          : undefined;
      const product: SiteSchemaProduct = { name, description, priceRange };
      return product;
    })
    .filter((p): p is SiteSchemaProduct => p !== null)
    .slice(0, MAX_PRODUCTS);
  return items.length ? items : fallback;
}

function parseTestimonialsField(
  value: unknown,
  fallback: ProjectSiteSchema["testimonials"],
): ProjectSiteSchema["testimonials"] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const items = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const obj = item as Record<string, unknown>;
      const quote = typeof obj.quote === "string" ? obj.quote.trim() : "";
      const author = typeof obj.author === "string" ? obj.author.trim() : "";
      if (!quote || !author) {
        return null;
      }
      const rawRating = obj.rating;
      const ratingNum =
        typeof rawRating === "number" ? rawRating : Number(rawRating);
      const rating: 1 | 2 | 3 | 4 | 5 | undefined = Number.isFinite(ratingNum)
        ? (Math.min(5, Math.max(1, Math.round(ratingNum))) as 1 | 2 | 3 | 4 | 5)
        : undefined;
      const testimonial: {
        quote: string;
        author: string;
        rating?: 1 | 2 | 3 | 4 | 5;
      } = { quote, author };
      if (rating !== undefined) {
        testimonial.rating = rating;
      }
      return testimonial;
    })
    .filter(
      (t): t is { quote: string; author: string; rating?: 1 | 2 | 3 | 4 | 5 } =>
        t !== null,
    )
    .slice(0, MAX_TESTIMONIALS);
  return items.length ? items : fallback;
}

function parseFaqField(
  value: unknown,
  fallback: ProjectSiteSchema["faq"],
): ProjectSiteSchema["faq"] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const items = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const obj = item as Record<string, unknown>;
      const q = typeof obj.q === "string" ? obj.q.trim() : "";
      const a = typeof obj.a === "string" ? obj.a.trim() : "";
      if (!q || !a) {
        return null;
      }
      // Trust beats spectacle: never keep FAQ pairs with empty answers.
      return { q, a };
    })
    .filter(
      (i): i is NonNullable<ProjectSiteSchema["faq"]>[number] => i !== null,
    )
    .slice(0, MAX_FAQ);
  return items.length ? items : fallback;
}

function parseSocialLinksField(
  value: unknown,
  fallback: SocialLinkValue[] | undefined,
): SocialLinkValue[] | undefined {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const items = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const obj = item as Record<string, unknown>;
      const platform = typeof obj.platform === "string" ? obj.platform : "";
      const handle = typeof obj.handle === "string" ? obj.handle.trim() : "";
      if (!platform || !handle) {
        return null;
      }
      const url =
        typeof obj.url === "string" ? obj.url.trim() || undefined : undefined;
      const link: SocialLinkValue = {
        platform: platform as SocialLinkValue["platform"],
        handle,
        url,
      };
      return link;
    })
    .filter((l): l is SocialLinkValue => l !== null)
    .slice(0, MAX_SOCIAL);
  return items.length ? items : fallback;
}

function parseHoursField(
  value: unknown,
  fallback: HoursValue[] | undefined,
): HoursValue[] | undefined {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const items = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const obj = item as Record<string, unknown>;
      const dayRange =
        typeof obj.dayRange === "string" ? obj.dayRange.trim() : "";
      const open = typeof obj.open === "string" ? obj.open.trim() : "";
      const close = typeof obj.close === "string" ? obj.close.trim() : "";
      if (!dayRange || !open || !close) {
        return null;
      }
      const note =
        typeof obj.note === "string" ? obj.note.trim() || undefined : undefined;
      const hour: HoursValue = { dayRange, open, close, note };
      return hour;
    })
    .filter((h): h is HoursValue => h !== null)
    .slice(0, MAX_HOURS);
  return items.length ? items : fallback;
}

function parsePaymentsField(
  value: unknown,
  fallback: PaymentMethodValue[] | undefined,
): PaymentMethodValue[] | undefined {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const items = value
    .map((item) => {
      if (typeof item === "string") {
        return { method: item as PaymentMethodValue["method"] };
      }
      if (!item || typeof item !== "object") {
        return null;
      }
      const obj = item as Record<string, unknown>;
      const method = typeof obj.method === "string" ? obj.method.trim() : "";
      if (!method) {
        return null;
      }
      const detail =
        typeof obj.detail === "string"
          ? obj.detail.trim() || undefined
          : undefined;
      const payment: PaymentMethodValue = {
        method: method as PaymentMethodValue["method"],
        detail,
      };
      return payment;
    })
    .filter((p): p is PaymentMethodValue => p !== null)
    .slice(0, MAX_PAYMENTS);
  return items.length ? items : fallback;
}
