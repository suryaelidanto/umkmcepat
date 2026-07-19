import { tool } from "ai";
import { z } from "zod";

import { type ProjectBrief } from "@/lib/projects/brief";
import {
  createProjectSiteSchemaFromBrief,
  type ProjectSiteSchema,
} from "@/lib/projects/site-schema";

export const implementationSpecTool = tool({
  description: "Present the full website implementation spec.",
  inputSchema: z.object({
    appKind: z.enum(["landing", "marketing_site", "interactive_app"]),
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
    content: z.record(z.string(), z.unknown()),
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

  return {
    version: 1,
    businessName: spec.businessName,
    eyebrow:
      spec.appKind === "interactive_app"
        ? "Aplikasi interaktif"
        : spec.businessName,
    headline: spec.pages[0].title,
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
  };
}

export function buildImplementationSpecPrompt(brief: ProjectBrief) {
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
    brief.notes.length ? `Conversation notes: ${brief.notes.join("; ")}` : "",
    `AI confidence: ${brief.confidence ?? 0}%`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Deterministic ImplementationSpec from an accepted discuss brief.
 * Must always pass parseImplementationSpec for ready briefs.
 */
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
  };

  const notes = ["spec_source:brief_fallback", ...cleanList(brief.notes, 8)];

  return {
    appKind: "landing",
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
