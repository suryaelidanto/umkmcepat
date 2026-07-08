import { type JSONSchema7 } from "ai";

import { type ProjectBrief } from "@/lib/projects/brief";
import {
  createFallbackProjectSiteSchema,
  parseProjectSiteSchema,
  type ProjectSiteSchema,
} from "@/lib/projects/site-schema";

export type ImplementationSpec = {
  appKind: "landing" | "marketing_site" | "interactive_app";
  businessName: string;
  pages: Array<{ slug: string; title: string; purpose: string }>;
  components: Array<{ name: string; purpose: string }>;
  features: string[];
  content: Record<string, unknown>;
  style: {
    direction: string;
    palette?: {
      accent?: string;
      background?: string;
      foreground?: string;
      muted?: string;
    };
  };
  primaryCta?: string;
  notes: string[];
};

const DEFAULT_PALETTE = {
  background: "#f6f7f4",
  foreground: "#111312",
  muted: "#6b706d",
  accent: "#f05a28",
};

export const implementationSpecJsonSchema: JSONSchema7 = {
  type: "object",
  properties: {
    appKind: {
      type: "string",
      enum: ["landing", "marketing_site", "interactive_app"],
    },
    businessName: { type: "string" },
    pages: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          slug: { type: "string" },
          title: { type: "string" },
          purpose: { type: "string" },
        },
        required: ["slug", "title", "purpose"],
        additionalProperties: false,
      },
    },
    components: {
      type: "array",
      minItems: 2,
      maxItems: 10,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          purpose: { type: "string" },
        },
        required: ["name", "purpose"],
        additionalProperties: false,
      },
    },
    features: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: { type: "string" },
    },
    content: { type: "object" },
    style: {
      type: "object",
      properties: {
        direction: { type: "string" },
        palette: {
          type: "object",
          properties: {
            background: { type: "string" },
            foreground: { type: "string" },
            muted: { type: "string" },
            accent: { type: "string" },
          },
        },
      },
      required: ["direction"],
    },
    primaryCta: { type: "string" },
    notes: { type: "array", items: { type: "string" } },
  },
  required: [
    "appKind",
    "businessName",
    "pages",
    "components",
    "features",
    "content",
    "style",
    "notes",
  ],
  additionalProperties: false,
};

export function createFallbackImplementationSpec(
  brief: ProjectBrief,
): ImplementationSpec {
  const fallback = createFallbackProjectSiteSchema(brief.prompt);
  return {
    appKind: "landing",
    businessName:
      brief.businessName || brief.businessType || fallback.businessName,
    pages: [
      {
        slug: "/",
        title: "Beranda",
        purpose:
          "Menjelaskan kebutuhan utama dari percakapan dan mengarahkan pengunjung ke langkah berikutnya.",
      },
    ],
    components: [
      { name: "Hero", purpose: "Menyampaikan pesan utama dengan jelas." },
      { name: "Details", purpose: "Menjawab pertanyaan utama pengunjung." },
    ],
    features: [brief.contactOrCta || "contact_flow"],
    content: {
      prompt: brief.prompt,
      offer: brief.offer,
      targetCustomer: brief.targetCustomer,
      notes: brief.notes,
    },
    style: {
      direction:
        brief.stylePreference ||
        "Tampilan bersih, hangat, dan mudah dipercaya.",
      palette: DEFAULT_PALETTE,
    },
    primaryCta: brief.contactOrCta || undefined,
    notes: ["Deterministic fallback spec from current brief metadata."],
  };
}

export function parseImplementationSpec(
  value: unknown,
  fallback: ImplementationSpec,
): ImplementationSpec {
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const data = value as Partial<ImplementationSpec>;
  const pages = Array.isArray(data.pages)
    ? data.pages
        .map(parsePage)
        .filter((page): page is ImplementationSpec["pages"][number] =>
          Boolean(page),
        )
        .slice(0, 6)
    : [];
  const components = Array.isArray(data.components)
    ? data.components
        .map(parseComponent)
        .filter(
          (component): component is ImplementationSpec["components"][number] =>
            Boolean(component),
        )
        .slice(0, 10)
    : [];
  const palette = data.style?.palette || {};

  return {
    appKind: ["landing", "marketing_site", "interactive_app"].includes(
      String(data.appKind),
    )
      ? (data.appKind as ImplementationSpec["appKind"])
      : fallback.appKind,
    businessName: clean(data.businessName, fallback.businessName, 80),
    pages: pages.length ? pages : fallback.pages,
    components: components.length ? components : fallback.components,
    features: cleanList(data.features, fallback.features, 10),
    content:
      data.content && typeof data.content === "object"
        ? data.content
        : fallback.content,
    style: {
      direction: clean(data.style?.direction, fallback.style.direction, 220),
      palette: {
        background: cleanHex(
          palette.background,
          fallback.style.palette?.background || DEFAULT_PALETTE.background,
        ),
        foreground: cleanHex(
          palette.foreground,
          fallback.style.palette?.foreground || DEFAULT_PALETTE.foreground,
        ),
        muted: cleanHex(
          palette.muted,
          fallback.style.palette?.muted || DEFAULT_PALETTE.muted,
        ),
        accent: cleanHex(
          palette.accent,
          fallback.style.palette?.accent || DEFAULT_PALETTE.accent,
        ),
      },
    },
    primaryCta:
      clean(data.primaryCta, fallback.primaryCta || "", 60) || undefined,
    notes: cleanList(data.notes, fallback.notes, 12),
  };
}

export function implementationSpecToSiteSchema(
  spec: ImplementationSpec,
): ProjectSiteSchema {
  const fallback = createFallbackProjectSiteSchema(spec.businessName);
  const contentText = JSON.stringify(spec.content)
    .replace(/[{}"\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const sections = spec.components.slice(0, 5).map((component) => ({
    title: component.name,
    body: component.purpose,
  }));

  return parseProjectSiteSchema(
    {
      version: 1,
      businessName: spec.businessName,
      eyebrow:
        spec.appKind === "interactive_app"
          ? "Aplikasi interaktif"
          : "Website custom",
      headline: spec.pages[0]?.title || spec.businessName,
      subheadline:
        spec.pages[0]?.purpose || contentText || fallback.subheadline,
      primaryCta: spec.primaryCta || "Lanjutkan",
      secondaryCta: spec.pages[1]?.title || "Lihat detail",
      audience: clean(
        String(spec.content.audience || spec.content.targetCustomer || ""),
        "Pengunjung yang tepat",
        80,
      ),
      offer: clean(
        String(spec.content.offer || contentText),
        fallback.offer,
        100,
      ),
      theme: {
        background:
          spec.style.palette?.background || DEFAULT_PALETTE.background,
        foreground:
          spec.style.palette?.foreground || DEFAULT_PALETTE.foreground,
        muted: spec.style.palette?.muted || DEFAULT_PALETTE.muted,
        accent: spec.style.palette?.accent || DEFAULT_PALETTE.accent,
      },
      trustPoints: spec.features
        .slice(0, 4)
        .map((feature) => feature.replace(/[_-]+/g, " ")),
      sections: sections.length >= 4 ? sections : fallback.sections,
    },
    fallback,
  );
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
  const title = clean(item.title, "", 80);
  const purpose = clean(item.purpose, "", 220);
  if (!title || !purpose) {
    return null;
  }
  return { slug: clean(item.slug, "/", 80) || "/", title, purpose };
}

function parseComponent(
  value: unknown,
): ImplementationSpec["components"][number] | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const item = value as { name?: unknown; purpose?: unknown };
  const name = clean(item.name, "", 80);
  const purpose = clean(item.purpose, "", 220);
  if (!name || !purpose) {
    return null;
  }
  return { name, purpose };
}

function clean(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") {
    return fallback;
  }
  const text = value.trim().replace(/\s+/g, " ");
  return text ? text.slice(0, maxLength) : fallback;
}

function cleanList(value: unknown, fallback: string[], maxItems: number) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const items = value
    .map((item) => clean(item, "", 160))
    .filter(Boolean)
    .slice(0, maxItems);
  return items.length ? items : fallback;
}

function cleanHex(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim()
    : fallback;
}
