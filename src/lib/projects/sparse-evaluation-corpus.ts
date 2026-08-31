import {
  evaluateTieredBriefReadiness,
  type Tier1MissingField,
} from "./brief-tiered-readiness";
import { parseCanonicalBrief, type ProjectBriefV2 } from "./canonical-brief";

export const SPARSE_CANONICAL_FIELDS = [
  "audience",
  "address",
  "deliveryArea",
  "priceRange",
  "hours",
  "testimonials",
  "certifications",
  "assets",
  "visualDirection",
] as const;

export type SparseCanonicalField = (typeof SPARSE_CANONICAL_FIELDS)[number];

export type SparseEvaluationCase = {
  id: string;
  input: Record<string, unknown>;
  expected: {
    tier1Satisfied: boolean;
    missingTier1: readonly Tier1MissingField[];
    omittedFields: readonly SparseCanonicalField[];
  };
};

export type SparseEvaluationResult = {
  id: string;
  ok: boolean;
  missingTier1: Tier1MissingField[];
  unexpectedFields: SparseCanonicalField[];
};

const contact = {
  channel: "whatsapp",
  label: "Pesan",
  value: "08123456789",
};

export const SPARSE_EVALUATION_CORPUS: readonly SparseEvaluationCase[] = [
  {
    id: "empty-brief",
    input: {},
    expected: {
      tier1Satisfied: false,
      missingTier1: ["businessName", "offer", "contact"],
      omittedFields: [...SPARSE_CANONICAL_FIELDS],
    },
  },
  {
    id: "identity-only",
    input: { businessName: "Kedai Pagi" },
    expected: {
      tier1Satisfied: false,
      missingTier1: ["offer", "contact"],
      omittedFields: [...SPARSE_CANONICAL_FIELDS],
    },
  },
  {
    id: "offer-only",
    input: { offer: "Kopi susu" },
    expected: {
      tier1Satisfied: false,
      missingTier1: ["businessName", "contact"],
      omittedFields: [...SPARSE_CANONICAL_FIELDS],
    },
  },
  {
    id: "contact-only",
    input: { contact },
    expected: {
      tier1Satisfied: false,
      missingTier1: ["businessName", "offer"],
      omittedFields: [...SPARSE_CANONICAL_FIELDS],
    },
  },
  {
    id: "minimal-fnb",
    input: {
      businessName: "Kedai Pagi",
      offer: "Kopi susu",
      contact,
    },
    expected: {
      tier1Satisfied: true,
      missingTier1: [],
      omittedFields: [
        "audience",
        "address",
        "deliveryArea",
        "priceRange",
        "hours",
        "testimonials",
        "certifications",
        "assets",
        "visualDirection",
      ],
    },
  },
  {
    id: "one-priced-product",
    input: {
      businessName: "Kedai Pagi",
      productOrService: [
        { isPrimary: true, name: "Kopi susu", priceRange: "Rp 18.000" },
      ],
      contact,
      priceRange: "Rp 18.000",
    },
    expected: {
      tier1Satisfied: true,
      missingTier1: [],
      omittedFields: [
        "audience",
        "address",
        "deliveryArea",
        "hours",
        "testimonials",
        "certifications",
        "assets",
        "visualDirection",
      ],
    },
  },
  {
    id: "local-service-with-location",
    input: {
      businessName: "Bengkel Sore",
      offer: "Servis motor",
      contact,
      address: "Jl. Melati No. 4",
    },
    expected: {
      tier1Satisfied: true,
      missingTier1: [],
      omittedFields: [
        "audience",
        "deliveryArea",
        "priceRange",
        "hours",
        "testimonials",
        "certifications",
        "assets",
        "visualDirection",
      ],
    },
  },
  {
    id: "online-service-with-area",
    input: {
      businessName: "Kelas Rangkai",
      offer: "Kelas merangkai bunga online",
      contact,
      deliveryArea: "Online",
      targetCustomer: "Pemula",
    },
    expected: {
      tier1Satisfied: true,
      missingTier1: [],
      omittedFields: [
        "address",
        "priceRange",
        "hours",
        "testimonials",
        "certifications",
        "assets",
        "visualDirection",
      ],
    },
  },
  {
    id: "owner-omits-photos",
    input: {
      businessName: "Jahit Rapi",
      offer: "Permak pakaian",
      contact,
      fieldState: { visuals: "declined" },
      stylePreference: "Tipografi tenang",
    },
    expected: {
      tier1Satisfied: true,
      missingTier1: [],
      omittedFields: [
        "audience",
        "address",
        "deliveryArea",
        "priceRange",
        "hours",
        "testimonials",
        "certifications",
        "assets",
      ],
    },
  },
  {
    id: "owner-uploads-one-asset",
    input: {
      businessName: "Kain Pagi",
      offer: "Kain tenun",
      contact,
      assets: [{ id: "asset-1", purpose: "product" }],
    },
    expected: {
      tier1Satisfied: true,
      missingTier1: [],
      omittedFields: [
        "audience",
        "address",
        "deliveryArea",
        "priceRange",
        "hours",
        "testimonials",
        "certifications",
        "visualDirection",
      ],
    },
  },
  {
    id: "proof-without-invention",
    input: {
      businessName: "Rasa Rumah",
      offer: "Nasi kotak",
      contact,
      testimonials: [{ author: "Dewi", quote: "Pesanannya tiba." }],
      certifications: [{ name: "Halal", issuer: "Pemilik" }],
    },
    expected: {
      tier1Satisfied: true,
      missingTier1: [],
      omittedFields: [
        "audience",
        "address",
        "deliveryArea",
        "priceRange",
        "hours",
        "assets",
        "visualDirection",
      ],
    },
  },
  {
    id: "complete-rich-brief",
    input: {
      businessName: "Ruang Sore",
      offer: "Kopi dan teh",
      contact,
      targetCustomer: "Pekerja sekitar",
      address: "Jl. Kenanga No. 2",
      priceRange: "Rp 15.000 - Rp 25.000",
      hours: [{ dayRange: "Senin - Jumat", open: "08:00", close: "17:00" }],
      testimonials: [{ author: "Rani", quote: "Rasanya pas." }],
      certifications: [{ name: "PIRT", issuer: "Pemilik" }],
      assets: [{ id: "asset-2", purpose: "hero" }],
      stylePreference: "Editorial hangat",
    },
    expected: {
      tier1Satisfied: true,
      missingTier1: [],
      omittedFields: ["deliveryArea"],
    },
  },
] as const;

export function evaluateSparseCase(
  evaluationCase: SparseEvaluationCase,
): SparseEvaluationResult {
  const brief = parseCanonicalBrief(evaluationCase.input);
  const readiness = evaluateTieredBriefReadiness(brief);
  const unexpectedFields = evaluationCase.expected.omittedFields.filter(
    (field) => hasCanonicalValue(brief, field),
  );

  return {
    id: evaluationCase.id,
    ok:
      readiness.canBuild === evaluationCase.expected.tier1Satisfied &&
      readiness.tier1.missing.join(",") ===
        evaluationCase.expected.missingTier1.join(",") &&
      unexpectedFields.length === 0,
    missingTier1: readiness.tier1.missing,
    unexpectedFields,
  };
}

function hasCanonicalValue(
  brief: ProjectBriefV2,
  field: SparseCanonicalField,
): boolean {
  switch (field) {
    case "audience":
      return Boolean(brief.audience?.trim());
    case "address":
      return Boolean(brief.content.address?.trim());
    case "deliveryArea":
      return Boolean(brief.content.deliveryArea?.trim());
    case "priceRange":
      return Boolean(brief.content.priceRange?.trim());
    case "visualDirection":
      return Boolean(brief.visualDirection?.trim());
    case "hours":
      return brief.content.hours.length > 0;
    case "testimonials":
      return brief.content.testimonials.length > 0;
    case "certifications":
      return brief.content.certifications.length > 0;
    case "assets":
      return brief.assets.length > 0;
  }
}
