import { type ProjectBrief } from "@/lib/projects/brief";
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
  const domain = detectBusinessDomain(brief);
  const businessName = cleanText(
    brief.businessName,
    deriveBusinessName(brief, domain),
    80,
  );
  const offer = cleanText(brief.offer, domain.defaultOffer, 120);
  const rawTargetCustomer = cleanText(
    brief.targetCustomer,
    "pelanggan sekitar yang butuh info cepat",
    140,
  );
  const rawContactOrCta = cleanText(
    brief.contactOrCta,
    "hubungi usaha untuk pesan atau bertanya",
    140,
  );
  const rawStylePreference = cleanText(
    brief.stylePreference,
    "tampilan bersih dan mudah dipercaya",
    140,
  );
  const targetCustomer = selectionLabel(rawTargetCustomer);
  const targetCustomerDetail = selectionDetail(rawTargetCustomer);
  const contactOrCta = selectionLabel(rawContactOrCta);
  const contactDetail = selectionDetail(rawContactOrCta);
  const stylePreference = selectionLabel(rawStylePreference);
  const styleDetail = selectionDetail(rawStylePreference);
  const theme = themeForBrief(brief, domain.key);
  const trustPoints = buildTrustPoints(offer, contactOrCta, stylePreference);
  const primaryCta = primaryCtaFor(rawContactOrCta);
  const secondaryCta = rawContactOrCta.toLowerCase().includes("maps")
    ? "Lihat lokasi"
    : "Lihat menu";

  return {
    version: 1,
    businessName,
    eyebrow: domain.eyebrow,
    headline: headlineForBrief(domain.key, offer, targetCustomer),
    subheadline: subheadlineForBrief(domain.key, contactOrCta, stylePreference),
    primaryCta,
    secondaryCta,
    audience: targetCustomer,
    offer,
    theme,
    trustPoints,
    sections: buildBriefSections({
      contactOrCta,
      contactDetail,
      domainLabel: domain.label,
      offer,
      stylePreference,
      styleDetail,
      targetCustomer,
      targetCustomerDetail,
    }),
    // Rich fields: only set when the brief actually populated them, so the
    tagline: brief.tagline?.trim() || undefined,
    // compileGeneratedSiteContract auto-fills content.usp with the same
    usp:
      brief.usp && brief.usp.length
        ? brief.usp
            .map((u) => u.trim())
            .filter(Boolean)
            .slice(0, MAX_USP)
        : trustPoints.slice(0, MAX_USP),
    products: briefProducts(brief),
    testimonials: briefTestimonials(brief),
    // faq is never populated from a brief (the brief type has no faq field),
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
        ? brief.businessImages.map((img) => ({
            url: `/api/media/${img.id}`,
            purpose: img.purpose || "business-image",
            alt: businessName,
          }))
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

export function createProjectSiteSchemaFromGeneratedContract(input: {
  contract: import("./generated-site-contract").GeneratedSiteContractV1;
  theme?: ProjectSiteSchema["theme"];
}): ProjectSiteSchema {
  const c = input.contract;
  const businessName = cleanText(c.business.name, "Usaha Lokal", 80);
  const offer = cleanText(c.content.offer, c.business.primaryJob, 120);
  const audience = cleanText(c.business.audience ?? "", "pelanggan baru", 80);
  const primaryCta = cleanText(c.business.primaryCta.label, "Hubungi kami", 44);
  return {
    version: 1,
    businessName,
    eyebrow: "",
    headline: cleanText(c.content.headline, businessName, 110),
    subheadline: cleanText(c.content.subheadline, c.business.primaryJob, 260),
    primaryCta,
    secondaryCta: "",
    audience,
    offer,
    theme: input.theme ?? defaultTheme,
    trustPoints: c.content?.trustPoints
      ? c.content.trustPoints.slice(0, MAX_TRUST_POINTS)
      : [],
    sections: c.page?.requiredSections
      ? c.page.requiredSections.slice(0, MAX_SECTIONS).map((s) => ({
          title: cleanText(s.purpose, "Bagian", 80),
          body: cleanText(s.purpose, "Konten bagian.", 260),
        }))
      : [],
    tagline: c.content?.headline || undefined,
    usp: c.content?.usp?.length ? c.content.usp.slice(0, MAX_USP) : undefined,
    products: c.content?.products?.length
      ? c.content.products.slice(0, MAX_PRODUCTS)
      : undefined,
    testimonials: c.content?.testimonials?.length
      ? c.content.testimonials.slice(0, MAX_TESTIMONIALS)
      : undefined,
    faq: [],
    socialLinks: c.content?.socialLinks?.length
      ? c.content.socialLinks.slice(0, MAX_SOCIAL)
      : undefined,
    currentPromo: c.content?.promotion || undefined,
    hours: c.content?.hours?.length
      ? c.content.hours.slice(0, MAX_HOURS)
      : undefined,
    paymentMethods: c.content?.paymentMethods?.length
      ? c.content.paymentMethods.slice(0, MAX_PAYMENTS)
      : undefined,
    priceRange: c.content?.priceRange || undefined,
    address: c.content?.address || undefined,
    deliveryArea: c.content?.deliveryArea || undefined,
    images: (() => {
      const contractObj = c as unknown as {
        design?: {
          approvedAssets?: Array<{ assetId: string; purpose?: string }>;
        };
        media?: {
          approvedAssets?: Array<{ assetId: string; purpose?: string }>;
        };
      };
      const assets =
        contractObj.design?.approvedAssets &&
        contractObj.design.approvedAssets.length > 0
          ? contractObj.design.approvedAssets
          : contractObj.media?.approvedAssets;
      if (assets && assets.length > 0) {
        return assets.map((asset) => ({
          url: `/api/media/${asset.assetId}`,
          purpose: asset.purpose || "business-image",
          alt: businessName,
        }));
      }
      return undefined;
    })(),
    routes: c.page.routes.map((r) => ({
      path: r.path,
      title: r.purpose,
    })),
    primaryCtaTarget:
      c.business.primaryCta.kind === "whatsapp" && c.business.primaryCta.target
        ? c.business.primaryCta.target.startsWith("http")
          ? c.business.primaryCta.target
          : buildContextualWhatsAppHref(
              c.business.primaryCta.target,
              businessName,
              offer,
            )
        : undefined,
    contact:
      c.business.primaryCta.kind && c.business.primaryCta.target
        ? {
            channel: c.business.primaryCta.kind,
            value:
              c.page.routes.length > 1 &&
              c.business.primaryCta.target.startsWith("#") &&
              !c.business.primaryCta.target.startsWith("#/")
                ? `#/#${c.business.primaryCta.target.slice(1)}`
                : c.business.primaryCta.target,
          }
        : undefined,
  };
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
  };
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

type BusinessDomain = {
  defaultBusinessName: string;
  defaultOffer: string;
  eyebrow: string;
  key: "angkringan" | "automotive" | "food" | "laundry" | "retail" | "service";
  label: string;
};

function detectBusinessDomain(brief: ProjectBrief): BusinessDomain {
  const text = normalizeSearchText([
    brief.prompt,
    brief.businessName,
    brief.businessType,
    brief.offer,
    brief.targetCustomer,
    brief.stylePreference,
    ...brief.notes,
  ]);

  if (text.includes("angkringan")) {
    return {
      defaultBusinessName: "Angkringan Hangat",
      defaultOffer: "Menu angkringan klasik",
      eyebrow: "Angkringan lokal",
      key: "angkringan",
      label: "angkringan",
    };
  }

  if (text.includes("laundry")) {
    return {
      defaultBusinessName: "Laundry Rapi",
      defaultOffer: "Cuci, setrika, dan layanan laundry harian",
      eyebrow: "Laundry cepat",
      key: "laundry",
      label: "laundry",
    };
  }

  if (
    text.includes("bengkel") ||
    text.includes("motor") ||
    text.includes("mobil") ||
    text.includes("servis")
  ) {
    return {
      defaultBusinessName: "Bengkel Siap Servis",
      defaultOffer: "Servis kendaraan dan pengecekan rutin",
      eyebrow: "Bengkel terpercaya",
      key: "automotive",
      label: "bengkel",
    };
  }

  if (
    text.includes("makanan") ||
    text.includes("kuliner") ||
    text.includes("bakso") ||
    text.includes("kopi") ||
    text.includes("roti")
  ) {
    return {
      defaultBusinessName: "Dapur Lokal",
      defaultOffer: "Menu favorit siap pesan",
      eyebrow: "Kuliner lokal",
      key: "food",
      label: "kuliner",
    };
  }

  if (
    text.includes("toko") ||
    text.includes("jual") ||
    text.includes("produk")
  ) {
    return {
      defaultBusinessName: "Toko Lokal",
      defaultOffer: "Produk pilihan untuk pelanggan sekitar",
      eyebrow: "Toko UMKM",
      key: "retail",
      label: "toko",
    };
  }

  return {
    defaultBusinessName: "Usaha Lokal",
    defaultOffer: "Layanan utama usaha",
    eyebrow: "Usaha lokal",
    key: "service",
    label: "usaha",
  };
}

function deriveBusinessName(brief: ProjectBrief, domain: BusinessDomain) {
  const promptText = normalizeSearchText([brief.prompt, brief.businessType]);

  if (domain.key === "angkringan" && promptText.includes("angkringan")) {
    return "Angkringan Hangat";
  }

  return domain.defaultBusinessName;
}

function themeForBrief(
  brief: ProjectBrief,
  domainKey: BusinessDomain["key"],
): ProjectSiteSchema["theme"] {
  const style = normalizeSearchText([
    brief.stylePreference,
    brief.businessType,
  ]);

  if (
    domainKey === "angkringan" ||
    style.includes("hangat") ||
    style.includes("tradisional") ||
    style.includes("kayu") ||
    style.includes("coklat")
  ) {
    return {
      background: "#f7f1e7",
      foreground: "#21170f",
      muted: "#755f4d",
      accent: "#c65a1e",
    };
  }

  if (style.includes("premium") || style.includes("bold")) {
    return {
      background: "#f4f1eb",
      foreground: "#171512",
      muted: "#6b645b",
      accent: "#8d6b32",
    };
  }

  if (domainKey === "laundry") {
    return {
      background: "#eef7f4",
      foreground: "#12211d",
      muted: "#587169",
      accent: "#1f8f7a",
    };
  }

  if (domainKey === "automotive") {
    return {
      background: "#f3f4f2",
      foreground: "#151715",
      muted: "#5f655f",
      accent: "#d3342f",
    };
  }

  return defaultTheme;
}

function primaryCtaFor(contactOrCta: string) {
  const text = normalizeSearchText([contactOrCta]);

  if (text.includes("wa") || text.includes("whatsapp")) {
    return "Pesan via WhatsApp";
  }

  if (text.includes("booking") || text.includes("reservasi")) {
    return "Booking sekarang";
  }

  if (text.includes("maps") || text.includes("lokasi")) {
    return "Lihat lokasi";
  }

  if (text.includes("pesan")) {
    return "Pesan sekarang";
  }

  return "Hubungi kami";
}

function headlineForBrief(
  domainKey: BusinessDomain["key"],
  offer: string,
  targetCustomer: string,
) {
  const shortTarget = lowerFirstPhrase(clipPhrase(targetCustomer, 58));

  if (domainKey === "angkringan") {
    return `Angkringan hangat untuk ${shortTarget}`;
  }

  if (domainKey === "laundry") {
    return `Laundry rapi untuk ${shortTarget}`;
  }

  if (domainKey === "automotive") {
    return `Servis motor rapi tanpa tebak-tebakan untuk ${shortTarget}`;
  }

  if (domainKey === "food") {
    return `${clipPhrase(offer, 46)} yang mudah dipesan`;
  }

  return `${clipPhrase(offer, 54)} untuk ${shortTarget}`;
}

function subheadlineForBrief(
  domainKey: BusinessDomain["key"],
  contactOrCta: string,
  stylePreference: string,
) {
  if (domainKey === "angkringan") {
    const stylePhrase = lowerFirstPhrase(stylePreference);

    return `Tampilkan menu, suasana warung, dan akses pesan lewat ${clipPhrase(contactOrCta, 64)}. Nuansa ${clipPhrase(stylePhrase, 92)} membantu pelanggan merasa dekat sebelum datang atau pesan.`;
  }

  if (domainKey === "automotive") {
    return `Tampilkan layanan bengkel, estimasi langkah servis, dan jalur ${clipPhrase(contactOrCta, 72)} supaya pelanggan datang dengan keluhan yang jelas.`;
  }

  return `Website menonjolkan penawaran utama, alasan pelanggan percaya, dan langkah berikutnya lewat ${clipPhrase(contactOrCta, 72)}.`;
}

function buildTrustPoints(
  offer: string,
  contactOrCta: string,
  stylePreference: string,
) {
  const offerSummary = summarizeOffer(offer);

  return [
    `${offerSummary} dijelaskan per kebutuhan pelanggan`,
    `${clipPhrase(contactOrCta, 42)} mudah ditemukan`,
    `Nuansa ${lowerFirstPhrase(clipPhrase(stylePreference, 42))}`,
  ];
}

function buildBriefSections({
  contactOrCta,
  contactDetail,
  domainLabel,
  offer,
  stylePreference,
  styleDetail,
  targetCustomer,
  targetCustomerDetail,
}: {
  contactOrCta: string;
  contactDetail?: string;
  domainLabel: string;
  offer: string;
  stylePreference: string;
  styleDetail?: string;
  targetCustomer: string;
  targetCustomerDetail?: string;
}): ProjectSiteSchema["sections"] {
  const offerSentence = stripTrailingPunctuation(offer);
  const targetContext = targetCustomerDetail
    ? `${lowerFirstPhrase(targetCustomer)} yang ${stripTrailingPunctuation(lowerFirstPhrase(targetCustomerDetail))}`
    : lowerFirstPhrase(targetCustomer);
  const contactContext = contactDetail
    ? `${contactOrCta} dibuat jelas. ${sentenceCase(stripTrailingPunctuation(contactDetail))}.`
    : `${contactOrCta} dibuat jelas.`;
  const styleContext = styleDetail
    ? `${sentenceCase(stripTrailingPunctuation(styleDetail))}. `
    : "";

  if (domainLabel === "bengkel") {
    return [
      {
        title: "Layanan servis",
        body: `${offerSentence}. Tiap layanan dibuat mudah dipahami agar pelanggan tahu apakah perlu datang untuk cek ringan, kelistrikan, ban, atau komponen lain.`,
      },
      {
        title: "Untuk pengendara",
        body: `Konten diarahkan untuk ${targetContext}. Halaman membantu mereka menjelaskan keluhan motor sebelum datang ke bengkel.`,
      },
      {
        title: "Booking dan konsultasi",
        body: `${contactContext} Pelanggan bisa tanya estimasi awal, jam ramai, atau kesiapan spare part tanpa bolak-balik.`,
      },
      {
        title: "Kesan bengkel",
        body: `Tampilan dibuat ${lowerFirstPhrase(stylePreference)}. ${styleContext}Kesan ini membangun rasa rapi, teknis, dan dapat dipercaya.`,
      },
    ];
  }

  return [
    {
      title: "Penawaran utama",
      body: `${offerSentence}. Tampilannya dibuat ringkas supaya pembeli cepat tahu pilihan utama sebelum pesan.`,
    },
    {
      title: "Untuk pembeli",
      body: `Konten diarahkan untuk ${targetContext}. Halaman menonjolkan menu, suasana, dan cara pesan yang mudah dipahami.`,
    },
    {
      title: "Pesan atau datang",
      body: `${contactContext} Pelanggan bisa langsung pesan atau mencari lokasi tanpa bertanya berulang.`,
    },
    {
      title: "Kesan visual",
      body: `Tampilan dibuat ${lowerFirstPhrase(stylePreference)}. ${styleContext}Kesan ini menjaga karakter ${domainLabel} yang akrab.`,
    },
  ];
}

export function normalizeSearchText(values: string[]) {
  return values.join(" ").toLowerCase().replace(/\s+/g, " ").trim();
}

function clipPhrase(value: string, maxLength: number) {
  const text = value.trim().replace(/\s+/g, " ");

  if (text.length <= maxLength) {
    return text;
  }

  const clipped = text.slice(0, maxLength);
  const lastSpace = clipped.lastIndexOf(" ");

  return clipped.slice(0, lastSpace > 16 ? lastSpace : maxLength).trim();
}

function selectionLabel(value: string) {
  return normalizeDisplayPhrase(splitSelection(value).label || value);
}

function selectionDetail(value: string) {
  return normalizeDisplayPhrase(splitSelection(value).detail);
}

function splitSelection(value: string) {
  const match = value.match(/^(.+?)\s*\((.+)\)\s*$/);

  if (!match) {
    return { detail: "", label: value };
  }

  return {
    detail: match[2],
    label: match[1],
  };
}

function normalizeDisplayPhrase(value: string) {
  return value
    .replace(/\s*&\s*/g, " dan ")
    .replace(/\bWA\b/g, "WhatsApp")
    .replace(/\s*\+\s*link\s+/gi, " dan ")
    .replace(/\s*\+\s*/g, " dan ")
    .replace(/\s+/g, " ")
    .trim();
}

function lowerFirstPhrase(value: string) {
  return value ? `${value[0].toLowerCase()}${value.slice(1)}` : value;
}

function sentenceCase(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function summarizeOffer(offer: string) {
  const [label] = offer.split(":");
  const summary = label && label.length >= 5 ? label : offer;

  return clipPhrase(summary, 42);
}

function stripTrailingPunctuation(value: string) {
  return value.trim().replace(/[.。!?]+$/g, "");
}
