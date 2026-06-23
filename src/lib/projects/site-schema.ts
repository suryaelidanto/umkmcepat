import { type JSONSchema7 } from "ai";

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
};

const MAX_TEXT = 220;
const MAX_SECTIONS = 5;
const MAX_TRUST_POINTS = 4;
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
  return text ? text.slice(0, maxLength) : fallback;
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

export function parseProjectSiteSchema(
  value: unknown,
  fallbackPrompt = "",
): ProjectSiteSchema {
  const fallback = createFallbackProjectSiteSchema(fallbackPrompt);

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
  };
}

export const projectSiteJsonSchema: JSONSchema7 = {
  type: "object",
  properties: {
    version: { type: "number", enum: [1] },
    businessName: { type: "string" },
    eyebrow: { type: "string" },
    headline: { type: "string" },
    subheadline: { type: "string" },
    primaryCta: { type: "string" },
    secondaryCta: { type: "string" },
    audience: { type: "string" },
    offer: { type: "string" },
    theme: {
      type: "object",
      properties: {
        background: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
        foreground: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
        muted: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
        accent: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
      },
      required: ["background", "foreground", "muted", "accent"],
      additionalProperties: false,
    },
    trustPoints: {
      type: "array",
      minItems: 3,
      maxItems: MAX_TRUST_POINTS,
      items: { type: "string" },
    },
    sections: {
      type: "array",
      minItems: 4,
      maxItems: MAX_SECTIONS,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
        },
        required: ["title", "body"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "version",
    "businessName",
    "eyebrow",
    "headline",
    "subheadline",
    "primaryCta",
    "secondaryCta",
    "audience",
    "offer",
    "theme",
    "trustPoints",
    "sections",
  ],
  additionalProperties: false,
};
