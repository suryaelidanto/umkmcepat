import { tool } from "ai";
import { z } from "zod";

import { KNOWN_ARCHETYPE_IDS } from "@/lib/projects/archetypes";
import { type ProjectBrief } from "@/lib/projects/brief";
import {
  type HoursValue,
  type PaymentMethodValue,
  type SocialLinkValue,
} from "@/lib/projects/brief-rich-fields";
import {
  createProjectSiteSchemaFromBrief,
  type ProjectSiteSchema,
  type SiteSchemaProduct,
} from "@/lib/projects/site-schema";

function archetypeFromBusinessType(businessType: string): string {
  const text = businessType.toLowerCase();
  const rules: Array<[string, string]> = [
    ["fnb", "fnb-menu"],
    ["warung makan", "fnb-menu"],
    ["restoran", "fnb-menu"],
    ["cafe", "fnb-menu"],
    ["kue", "fnb-light"],
    ["snack", "fnb-light"],
    ["catering", "fnb-light"],
    ["retail", "retail-catalog"],
    ["fashion", "retail-catalog"],
    ["thrift", "retail-catalog"],
    ["kelontong", "retail-grocery"],
    ["sembako", "retail-grocery"],
    ["jasa_lokal", "service-area"],
    ["laundry", "service-area"],
    ["barber", "service-appointment"],
    ["klinik", "service-appointment"],
    ["jasa_online", "service-online"],
    ["freelance", "service-online"],
    ["desain", "service-online"],
    ["kursus", "education-course"],
    ["bimbel", "education-course"],
  ];
  for (const [needle, id] of rules) {
    if (text.includes(needle)) {
      return id;
    }
  }
  return "generic";
}

export const implementationSpecTool = tool({
  description: "Present the full website implementation spec.",
  inputSchema: z.object({
    appKind: z.enum(["landing", "marketing_site", "interactive_app"]),
    archetype: z
      .string()
      .describe(
        "The archetype id that best fits this business shape. Pick from the archetype index. Use 'generic' if none fits.",
      ),
    businessName: z.string(),
    pages: z
      .array(
        z.object({
          slug: z.string(),
          title: z.string().optional(),
          purpose: z.string(),
        }),
      )
      .min(1)
      .max(6),
    components: z
      .array(z.object({ name: z.string(), purpose: z.string() }))
      .min(2)
      .max(10),
    features: z.array(z.string()).min(1).max(10),
    content: z.object({}).passthrough(),
    style: z.object({
      direction: z.string(),
      palette: z.object({
        background: z.string(),
        foreground: z.string(),
        muted: z.string(),
        accent: z.string(),
      }),
    }),
    primaryCta: z.string(),
    notes: z.array(z.string()),
  }),
});

export type ImplementationSpec = {
  appKind: "landing" | "marketing_site" | "interactive_app";
  archetype: string;
  businessName: string;
  pages: Array<{ slug: string; title: string; purpose: string }>;
  components: Array<{ name: string; purpose: string }>;
  features: string[];
  content: Record<string, unknown>;
  style: {
    direction: string;
    palette: {
      accent: string;
      background: string;
      foreground: string;
      muted: string;
    };
  };
  primaryCta: string;
  notes: string[];
};

export function parseImplementationSpec(
  value: unknown,
): ImplementationSpec | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Partial<ImplementationSpec>;
  const appKind = ["landing", "marketing_site", "interactive_app"].includes(
    String(data.appKind),
  )
    ? (data.appKind as ImplementationSpec["appKind"])
    : null;
  const archetypeRaw =
    typeof data.archetype === "string"
      ? data.archetype.trim().toLowerCase()
      : "";
  const archetype = KNOWN_ARCHETYPE_IDS.includes(archetypeRaw)
    ? archetypeRaw
    : "generic";
  const businessName = clean(data.businessName, 80);
  const pages = Array.isArray(data.pages)
    ? data.pages.map(parsePage).filter(nonNullable).slice(0, 6)
    : [];
  const components = Array.isArray(data.components)
    ? data.components.map(parseComponent).filter(nonNullable).slice(0, 10)
    : [];
  const features = cleanList(data.features, 10);
  const direction = clean(data.style?.direction, 220);
  const primaryCta = clean(data.primaryCta, 60);
  const palette = data.style?.palette;
  const parsedPalette = palette
    ? {
        background: cleanHex(palette.background),
        foreground: cleanHex(palette.foreground),
        muted: cleanHex(palette.muted),
        accent: cleanHex(palette.accent),
      }
    : undefined;

  if (
    !appKind ||
    !businessName ||
    !pages.length ||
    components.length < 2 ||
    !features.length ||
    !data.content ||
    typeof data.content !== "object" ||
    !direction ||
    !primaryCta ||
    !parsedPalette?.background ||
    !parsedPalette.foreground ||
    !parsedPalette.muted ||
    !parsedPalette.accent ||
    !Array.isArray(data.notes)
  ) {
    return null;
  }

  return {
    appKind,
    archetype,
    businessName,
    pages,
    components,
    features,
    content: data.content,
    style: {
      direction,
      palette: {
        background: parsedPalette.background,
        foreground: parsedPalette.foreground,
        muted: parsedPalette.muted,
        accent: parsedPalette.accent,
      },
    },
    primaryCta,
    notes: cleanList(data.notes, 12),
  };
}

export function implementationSpecToSiteSchema(
  spec: ImplementationSpec,
): ProjectSiteSchema {
  const contentText = JSON.stringify(spec.content)
    .replace(/[{}"\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const audience = clean(
    spec.content.audience || spec.content.targetCustomer,
    80,
  );
  const offer = clean(spec.content.offer, 100);

  const rawHeadline = spec.pages[0].title?.trim() || "";
  const isGenericHeadline = /^(beranda|home|welcome|beranda utama)$/i.test(
    rawHeadline,
  );
  const headline = isGenericHeadline
    ? `${clean(spec.businessName, 80) || "Usaha"} — ${clean(offer, 60)}`
    : rawHeadline;

  // Rich fields: pass through from spec.content when the AI structured them.
  const products = parseSpecProducts(spec.content.products);
  const testimonials = parseSpecTestimonials(spec.content.testimonials);
  const faq = parseSpecFaq(spec.content.faq);
  const socialLinks = parseSpecSocialLinks(spec.content.socialLinks);

  return {
    version: 1,
    businessName: spec.businessName,
    eyebrow:
      spec.appKind === "interactive_app" && !isGenericHeadline
        ? "Aplikasi interaktif"
        : spec.businessName,
    headline: headline,
    subheadline: spec.pages[0].purpose || contentText,
    primaryCta: spec.primaryCta,
    secondaryCta: spec.pages[1]?.title || spec.primaryCta,
    audience: audience || spec.businessName,
    offer: offer || contentText || spec.features.join(", "),
    theme: {
      background: spec.style.palette.background,
      foreground: spec.style.palette.foreground,
      muted: spec.style.palette.muted,
      accent: spec.style.palette.accent,
    },
    trustPoints: spec.features
      .slice(0, 4)
      .map((feature) => feature.replace(/[_-]+/g, " ")),
    sections: spec.components.slice(0, 5).map((component) => ({
      title: component.name,
      body: component.purpose,
    })),
    tagline: cleanOptionalString(spec.content.tagline, 160),
    usp: parseSpecUsp(spec.content.usp),
    products,
    testimonials,
    faq,
    socialLinks,
    currentPromo: cleanOptionalString(spec.content.currentPromo, 220),
    hours: parseSpecHours(spec.content.hours),
    paymentMethods: parseSpecPayments(spec.content.paymentMethods),
    priceRange: cleanOptionalString(spec.content.priceRange, 80),
    address: cleanOptionalString(spec.content.address, 160),
    deliveryArea: cleanOptionalString(spec.content.deliveryArea, 120),
  };
}

function cleanOptionalString(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const text = value.trim().replace(/\s+/g, " ");
  return text ? text.slice(0, maxLength) : undefined;
}

function parseSpecProducts(value: unknown): SiteSchemaProduct[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const obj = item as Record<string, unknown>;
      const name =
        typeof obj.name === "string"
          ? obj.name.trim()
          : typeof obj.title === "string"
            ? obj.title.trim()
            : typeof obj.model === "string"
              ? obj.model.trim()
              : "";
      if (!name) {
        return null;
      }
      const description =
        typeof obj.description === "string"
          ? obj.description.trim() || undefined
          : typeof obj.condition === "string"
            ? obj.condition.trim() || undefined
            : undefined;
      const priceRange =
        typeof obj.priceRange === "string"
          ? obj.priceRange.trim() || undefined
          : typeof obj.price === "string"
            ? obj.price.trim() || undefined
            : undefined;
      const product: SiteSchemaProduct = { name, description, priceRange };
      return product;
    })
    .filter((p): p is SiteSchemaProduct => p !== null)
    .slice(0, 12);
  return items.length ? items : undefined;
}

function parseSpecTestimonials(
  value: unknown,
): ProjectSiteSchema["testimonials"] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const obj = item as Record<string, unknown>;
      const quote =
        typeof obj.quote === "string"
          ? obj.quote.trim()
          : typeof obj.comment === "string"
            ? obj.comment.trim()
            : "";
      const author =
        typeof obj.author === "string"
          ? obj.author.trim()
          : typeof obj.name === "string"
            ? obj.name.trim()
            : "";
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
    .slice(0, 8);
  return items.length ? items : undefined;
}

function parseSpecFaq(value: unknown): ProjectSiteSchema["faq"] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const obj = item as Record<string, unknown>;
      const q =
        typeof obj.q === "string"
          ? obj.q.trim()
          : typeof obj.question === "string"
            ? obj.question.trim()
            : "";
      const a =
        typeof obj.a === "string"
          ? obj.a.trim()
          : typeof obj.answer === "string"
            ? obj.answer.trim()
            : "";
      if (!q || !a) {
        return null;
      }
      return { q, a };
    })
    .filter(
      (i): i is NonNullable<ProjectSiteSchema["faq"]>[number] => i !== null,
    )
    .slice(0, 10);
  return items.length ? items : undefined;
}

function parseSpecSocialLinks(value: unknown): SocialLinkValue[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const obj = item as Record<string, unknown>;
      const platform =
        typeof obj.platform === "string" ? obj.platform.trim() : "";
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
    .slice(0, 6);
  return items.length ? items : undefined;
}

function parseSpecUsp(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 6);
  return items.length ? items : undefined;
}

function parseSpecHours(value: unknown): HoursValue[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
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
    .slice(0, 7);
  return items.length ? items : undefined;
}

function parseSpecPayments(value: unknown): PaymentMethodValue[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
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
    .slice(0, 8);
  return items.length ? items : undefined;
}

export function buildImplementationSpecPrompt(brief: ProjectBrief) {
  const richLines: string[] = [];
  if (brief.tagline) {
    richLines.push(`Tagline: ${brief.tagline}`);
  }
  if (brief.usp?.length) {
    richLines.push(`Unique selling points: ${brief.usp.join("; ")}`);
  }
  if (brief.productOrService?.length) {
    const items = brief.productOrService
      .map(
        (p) =>
          `${p.name}${p.description ? ` (${p.description})` : ""}${p.priceRange ? ` — ${p.priceRange}` : ""}`,
      )
      .join("; ");
    richLines.push(`Products/services: ${items}`);
  }
  if (brief.testimonials?.length) {
    const items = brief.testimonials
      .map(
        (t) => `"${t.quote}" — ${t.author}${t.rating ? ` (${t.rating}★)` : ""}`,
      )
      .join("; ");
    richLines.push(`Testimonials: ${items}`);
  }
  if (brief.currentPromo) {
    richLines.push(`Current promo: ${brief.currentPromo}`);
  }
  if (brief.priceRange) {
    richLines.push(`Price range: ${brief.priceRange}`);
  }
  if (brief.paymentMethods?.length) {
    richLines.push(
      `Payment methods: ${brief.paymentMethods.map((p) => p.method).join(", ")}`,
    );
  }
  if (brief.socialLinks?.length) {
    richLines.push(
      `Social links: ${brief.socialLinks.map((s) => `${s.platform}:${s.handle}`).join(", ")}`,
    );
  }
  if (brief.address) {
    richLines.push(`Address: ${brief.address}`);
  }
  if (brief.deliveryArea) {
    richLines.push(`Delivery area: ${brief.deliveryArea}`);
  }
  return [
    `Initial request: ${brief.prompt}`,
    brief.businessName ? `Business name: ${brief.businessName}` : "",
    brief.businessType ? `Business type: ${brief.businessType}` : "",
    brief.offer ? `Offer: ${brief.offer}` : "",
    brief.targetCustomer ? `Target customer: ${brief.targetCustomer}` : "",
    brief.contactOrCta ? `Known action/contact: ${brief.contactOrCta}` : "",
    brief.stylePreference
      ? `Known style direction: ${brief.stylePreference}`
      : "",
    ...richLines,
    brief.notes.length ? `Conversation notes: ${brief.notes.join("; ")}` : "",
    `AI confidence: ${brief.confidence ?? 0}%`,
    // Structured content directive: tell the AI to put rich fields in
    `STRUCTURED CONTENT RULE: put products, testimonials, faq, socialLinks, currentPromo in spec.content as separate structured arrays/strings — never stuff them into the offer field. Use offer for the one-line value proposition only.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function implementationSpecFromBrief(
  brief: ProjectBrief,
): ImplementationSpec {
  const schema = createProjectSiteSchemaFromBrief(brief);
  const businessName = clean(schema.businessName, 80) || "Usaha Lokal";
  const offer = clean(schema.offer || brief.offer, 120) || businessName;
  const audience =
    clean(schema.audience || brief.targetCustomer, 120) || "pelanggan sekitar";
  const primaryCta =
    clean(schema.primaryCta || brief.contactOrCta, 60) || "Hubungi kami";
  const direction =
    clean(brief.stylePreference, 220) ||
    clean(schema.subheadline, 220) ||
    "Tampilan bersih, mudah dipercaya, cocok UMKM.";
  const tagline = clean(brief.tagline, 120);
  const features = [
    offer,
    ...(brief.usp ?? []).map((item) => clean(item, 160)),
    ...(brief.productOrService ?? []).map((item) => clean(item.name, 160)),
    brief.deliveryArea ? clean(brief.deliveryArea, 160) : "",
    brief.priceRange ? `Harga: ${clean(brief.priceRange, 80)}` : "",
  ]
    .filter(Boolean)
    .slice(0, 10);
  if (!features.length) {
    features.push(offer);
  }

  const palette = {
    background: cleanHex(schema.theme.background) || "#ffffff",
    foreground: cleanHex(schema.theme.foreground) || "#111111",
    muted: cleanHex(schema.theme.muted) || "#6b7280",
    accent: cleanHex(schema.theme.accent) || "#16a34a",
  };

  const archetype = archetypeFromBusinessType(
    clean(brief.businessType, 80) || "",
  );

  const pages = [
    {
      slug: "home",
      title: clean(schema.headline, 80) || businessName,
      purpose:
        clean(schema.subheadline, 220) ||
        `Landing page untuk ${businessName}: ${offer}.`,
    },
  ];

  const components = [
    {
      name: "Hero",
      purpose: tagline
        ? `Hero dengan tagline ${tagline} dan CTA utama.`
        : `Hero ${businessName} dengan penawaran utama dan CTA.`,
    },
    {
      name: "Offer",
      purpose: `Menampilkan ${offer} untuk ${audience}.`,
    },
    {
      name: "Contact",
      purpose: `Kontak / aksi: ${primaryCta}.`,
    },
  ];

  // Rich content: only list components + content the brief actually populated.
  if (schema.products?.length) {
    components.push({
      name: "ProductCatalog",
      purpose: `Render ${schema.products.length} produk/jasa dari site.products sebagai kartu dengan nama, deskripsi, dan harga/priceRange.`,
    });
  }
  if (schema.testimonials?.length) {
    components.push({
      name: "Testimonials",
      purpose: `Render ${schema.testimonials.length} testimoni dari site.testimonials dengan kutipan, nama, dan rating bintang.`,
    });
  }
  if (schema.faq?.length) {
    components.push({
      name: "Faq",
      purpose: `Render ${schema.faq.length} pasangan Q/A dari site.faq sebagai accordion atau daftar.`,
    });
  }
  if (schema.currentPromo) {
    components.push({
      name: "PromoBanner",
      purpose: `Banner promo aktif: ${schema.currentPromo.slice(0, 120)}.`,
    });
  }
  if (schema.socialLinks?.length) {
    components.push({
      name: "SocialLinks",
      purpose: `Tautan sosial: ${schema.socialLinks.map((s) => s.platform).join(", ")}.`,
    });
  }

  const content: Record<string, unknown> = {
    offer,
    audience,
    targetCustomer: audience,
    tagline: tagline || undefined,
    contactOrCta: brief.contactOrCta || primaryCta,
    businessType: brief.businessType || undefined,
    priceRange: brief.priceRange || undefined,
    paymentMethods: brief.paymentMethods || undefined,
    deliveryArea: brief.deliveryArea || undefined,
    // Rich fields mirrored from site.ts so the writer prompt tells the AI what
    products: schema.products,
    testimonials: schema.testimonials,
    faq: schema.faq,
    socialLinks: schema.socialLinks,
    currentPromo: schema.currentPromo,
    hours: schema.hours,
    address: schema.address,
    usp: schema.usp,
  };

  const notes = ["spec_source:brief_fallback", ...cleanList(brief.notes, 8)];

  return {
    appKind: "landing",
    archetype,
    businessName,
    pages,
    components,
    features,
    content,
    style: {
      direction,
      palette,
    },
    primaryCta,
    notes,
  };
}

function parsePage(value: unknown): ImplementationSpec["pages"][number] | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const item = value as { purpose?: unknown; slug?: unknown; title?: unknown };
  const slug = clean(item.slug, 80);
  const title = clean(item.title || "Beranda", 80);
  const purpose = clean(item.purpose, 220);
  return slug && title && purpose ? { slug, title, purpose } : null;
}

function parseComponent(
  value: unknown,
): ImplementationSpec["components"][number] | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const item = value as { name?: unknown; purpose?: unknown };
  const name = clean(item.name, 80);
  const purpose = clean(item.purpose, 220);
  return name && purpose ? { name, purpose } : null;
}

function clean(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function cleanList(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => clean(item, 160))
    .filter(Boolean)
    .slice(0, maxItems);
}

function cleanHex(value: unknown) {
  const text = clean(value, 7);
  return /^#[0-9a-f]{6}$/i.test(text) ? text : undefined;
}

function nonNullable<T>(value: T | null): value is T {
  return value !== null;
}
