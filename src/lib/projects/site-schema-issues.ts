import { type ProjectBrief } from "@/lib/projects/brief";

import {
  type ProjectSiteSchema,
  normalizeSearchText,
  parseProjectSiteSchema,
} from "./site-schema";

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

function containsGenericCopy(value: string) {
  const text = normalizeSearchText([value]);
  return GENERIC_COPY_PATTERNS.some((pattern) => text.includes(pattern));
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
