import { tool } from "ai";
import { z } from "zod";

import { type ProjectBrief } from "@/lib/projects/brief";
import { type ProjectSiteSchema } from "@/lib/projects/site-schema";

export const implementationSpecTool = tool({
  description: "Present the full website implementation spec.",
  inputSchema: z.object({
    appKind: z.enum(["landing", "marketing_site", "interactive_app"]),
    businessName: z.string(),
    pages: z
      .array(
        z.object({
          slug: z.string(),
          title: z.string(),
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

function parsePage(value: unknown): ImplementationSpec["pages"][number] | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const item = value as { purpose?: unknown; slug?: unknown; title?: unknown };
  const slug = clean(item.slug, 80);
  const title = clean(item.title, 80);
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
