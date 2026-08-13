export type GeneratedSiteVisualReferenceFamily =
  | "editorial-airy"
  | "menu-led-editorial"
  | "catalog-story"
  | "warm-commerce"
  | "bold-typographic";

export type GeneratedSiteVisualReferenceLabelV1 = {
  gallery: "01" | "02" | "03" | "04" | "07";
  verdict: "accepted";
  routeSha256: string;
  desktopSha256: string;
  mobileSha256: string;
  family: GeneratedSiteVisualReferenceFamily;
  traits: string[];
  unsafeToCopy: string[];
};

export type GeneratedSiteVisualReferenceCorpusV1 = {
  schemaVersion: 1;
  accepted: GeneratedSiteVisualReferenceLabelV1[];
  rejectedVisibleCount: 28;
  technicalNegativeCount: 6;
};

const APPROVED_GALLERIES = ["01", "02", "03", "04", "07"] as const;
const APPROVED_FAMILIES = [
  "editorial-airy",
  "menu-led-editorial",
  "catalog-story",
  "warm-commerce",
  "bold-typographic",
] as const;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function parseGeneratedSiteVisualReferenceCorpus(
  value: unknown,
): GeneratedSiteVisualReferenceCorpusV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("invalid generated-site visual reference corpus");
  }
  if (
    value.rejectedVisibleCount !== 28 ||
    value.technicalNegativeCount !== 6 ||
    !Array.isArray(value.accepted)
  ) {
    throw new Error("invalid generated-site visual reference counts");
  }

  const accepted = value.accepted.map((item) => parseReference(item));
  if (accepted.length !== APPROVED_GALLERIES.length) {
    throw new Error("invalid generated-site visual reference counts");
  }
  const galleries = accepted.map((item) => item.gallery);
  if (
    APPROVED_GALLERIES.some((gallery) => !galleries.includes(gallery)) ||
    new Set(galleries).size !== APPROVED_GALLERIES.length
  ) {
    throw new Error("unapproved generated-site visual reference");
  }

  return {
    schemaVersion: 1,
    accepted: [...accepted].sort((left, right) =>
      left.gallery.localeCompare(right.gallery),
    ),
    rejectedVisibleCount: 28,
    technicalNegativeCount: 6,
  };
}

function parseReference(value: unknown): GeneratedSiteVisualReferenceLabelV1 {
  if (!isRecord(value)) {
    throw new Error("invalid generated-site visual reference");
  }
  const gallery = value.gallery;
  if (
    typeof gallery !== "string" ||
    !APPROVED_GALLERIES.includes(gallery as (typeof APPROVED_GALLERIES)[number])
  ) {
    throw new Error("unapproved generated-site visual reference");
  }
  if (
    value.verdict !== "accepted" ||
    typeof value.routeSha256 !== "string" ||
    typeof value.desktopSha256 !== "string" ||
    typeof value.mobileSha256 !== "string" ||
    !SHA256_PATTERN.test(value.routeSha256) ||
    !SHA256_PATTERN.test(value.desktopSha256) ||
    !SHA256_PATTERN.test(value.mobileSha256) ||
    typeof value.family !== "string" ||
    !APPROVED_FAMILIES.includes(
      value.family as (typeof APPROVED_FAMILIES)[number],
    ) ||
    !stringArray(value.traits) ||
    value.traits.length === 0 ||
    !stringArray(value.unsafeToCopy) ||
    value.unsafeToCopy.length === 0
  ) {
    throw new Error("invalid generated-site visual reference");
  }
  return {
    gallery: gallery as GeneratedSiteVisualReferenceLabelV1["gallery"],
    verdict: "accepted",
    routeSha256: value.routeSha256,
    desktopSha256: value.desktopSha256,
    mobileSha256: value.mobileSha256,
    family: value.family as GeneratedSiteVisualReferenceFamily,
    traits: value.traits,
    unsafeToCopy: value.unsafeToCopy,
  };
}

function stringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
