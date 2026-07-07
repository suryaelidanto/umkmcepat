import { type JSONSchema7 } from "ai";

import { type ProjectBrief } from "@/lib/projects/brief";

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
const GENERIC_COPY_PATTERNS = [
  "permintaan awal",
  "produk dan layanan usaha",
  "website usaha",
  "pelanggan baru",
  "tentang usaha",
  "untuk pelanggan",
  "cara memesan",
  "info jelas",
  "mudah dihubungi",
  "siap dibuka dari hp",
  "website sederhana untuk menjelaskan usaha",
];
const STOP_WORDS = new Set([
  "anda",
  "atau",
  "buat",
  "cari",
  "dalam",
  "dengan",
  "fisik",
  "harga",
  "ingin",
  "jadi",
  "juga",
  "kami",
  "kamu",
  "link",
  "menu",
  "mudah",
  "online",
  "paling",
  "saya",
  "supaya",
  "yang",
]);
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
    trustPoints: buildTrustPoints(offer, contactOrCta, stylePreference),
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
  };
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
  };
}

export function resolveProjectSiteSchemaCandidate({
  brief,
  fallbackSchema,
  value,
}: {
  brief: ProjectBrief;
  fallbackSchema: ProjectSiteSchema;
  value: unknown;
}) {
  const candidateIssues = getProjectSiteSchemaCandidateIssues(value);
  const schema = parseProjectSiteSchema(value, fallbackSchema);
  const qualityIssues = getProjectSiteSchemaQualityIssues(schema, brief);

  if (candidateIssues.length && !qualityIssues.length) {
    return {
      issues: [],
      schema: fallbackSchema,
      usedDeterministicFallback: true,
    };
  }

  return {
    issues: [...new Set([...candidateIssues, ...qualityIssues])],
    schema,
    usedDeterministicFallback: false,
  };
}

export function getProjectSiteSchemaQualityIssues(
  schema: ProjectSiteSchema,
  brief?: ProjectBrief,
) {
  const issues: string[] = [];
  const searchable = normalizeSearchText([
    schema.businessName,
    schema.eyebrow,
    schema.headline,
    schema.subheadline,
    schema.audience,
    schema.offer,
    schema.primaryCta,
    schema.secondaryCta,
    ...schema.trustPoints,
    ...schema.sections.flatMap((section) => [section.title, section.body]),
  ]);

  if (containsGenericCopy(schema.businessName)) {
    issues.push("business_name_is_prompt");
  }

  if (containsGenericCopy(schema.headline)) {
    issues.push("headline_is_generic");
  }

  if (containsGenericCopy(schema.offer)) {
    issues.push("offer_is_generic");
  }

  if (
    schema.sections.length < 4 ||
    schema.sections.some((section) => containsGenericCopy(section.title))
  ) {
    issues.push("sections_are_generic");
  }

  if (schema.trustPoints.some((point) => containsGenericCopy(point))) {
    issues.push("trust_points_are_generic");
  }

  if (brief?.offer && !sharesMeaningfulToken(searchable, brief.offer)) {
    issues.push("offer_not_reflected");
  }

  if (
    brief?.targetCustomer &&
    !sharesMeaningfulToken(searchable, brief.targetCustomer)
  ) {
    issues.push("target_customer_not_reflected");
  }

  if (
    brief?.contactOrCta &&
    !sharesMeaningfulToken(searchable, brief.contactOrCta)
  ) {
    issues.push("cta_not_reflected");
  }

  return [...new Set(issues)];
}

export function getProjectSiteSchemaCandidateIssues(value: unknown) {
  const issues: string[] = [];

  if (!value || typeof value !== "object") {
    return ["missing_schema"];
  }

  const data = value as Record<string, unknown>;
  const theme =
    data.theme && typeof data.theme === "object"
      ? (data.theme as Record<string, unknown>)
      : null;

  for (const field of [
    "businessName",
    "eyebrow",
    "headline",
    "subheadline",
    "primaryCta",
    "secondaryCta",
    "audience",
    "offer",
  ]) {
    if (typeof data[field] !== "string" || !data[field].trim()) {
      issues.push(`missing_${field}`);
    }
  }

  if (
    !theme ||
    !["background", "foreground", "muted", "accent"].every(
      (field) => typeof theme[field] === "string" && theme[field],
    )
  ) {
    issues.push("missing_theme");
  }

  if (!Array.isArray(data.trustPoints) || data.trustPoints.length < 3) {
    issues.push("missing_trust_points");
  }

  if (!Array.isArray(data.sections) || data.sections.length < 4) {
    issues.push("missing_sections");
  }

  return issues;
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

function containsGenericCopy(value: string) {
  const text = normalizeSearchText([value]);
  return GENERIC_COPY_PATTERNS.some((pattern) => text.includes(pattern));
}

function normalizeSearchText(values: string[]) {
  return values.join(" ").toLowerCase().replace(/\s+/g, " ").trim();
}

function sharesMeaningfulToken(searchable: string, value: string) {
  return tokenizeMeaningful(value).some((token) => searchable.includes(token));
}

function tokenizeMeaningful(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token &&
        !STOP_WORDS.has(token) &&
        (token.length >= 3 || token === "wa"),
    );
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
