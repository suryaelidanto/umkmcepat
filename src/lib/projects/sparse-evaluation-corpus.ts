import {
  evaluateTieredBriefReadiness,
  type Tier1MissingField,
} from "./brief-tiered-readiness";
import { parseCanonicalBrief, type ProjectBriefV2 } from "./canonical-brief";
import {
  createEmptyFactLedger,
  createFactLedgerEntriesFromPatch,
  getRenderableFactEntries,
  mergeFactLedger,
} from "./fact-ledger";
import {
  designDirectionSchema,
  type DesignDirectionInput,
} from "./generated-design-docs";
import { parseVisualReview, VISUAL_REVIEW_CATEGORIES } from "./visual-review";

export const SPARSE_BUSINESS_CATEGORIES = [
  "coffee",
  "workshop",
  "catering",
  "salon",
  "laundry",
  "grocery",
  "artisan",
  "local_professional",
] as const;

export const SPARSE_CASE_CONDITIONS = [
  "minimal",
  "rich",
  "no_photo",
  "explicit_omission",
] as const;

export type SparseBusinessCategory =
  (typeof SPARSE_BUSINESS_CATEGORIES)[number];
export type SparseCaseCondition = (typeof SPARSE_CASE_CONDITIONS)[number];

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
  category: SparseBusinessCategory;
  condition: SparseCaseCondition;
  input: Record<string, unknown>;
  expected: {
    tier1Satisfied: boolean;
    missingTier1: readonly Tier1MissingField[];
    omittedFields: readonly SparseCanonicalField[];
    explicitOmissionIds: readonly string[];
  };
};

export type SparseEvaluationResult = {
  id: string;
  category: SparseBusinessCategory;
  condition: SparseCaseCondition;
  ok: boolean;
  truthBoundaryValid: boolean;
  omissionStateValid: boolean;
  readinessValid: boolean;
  strategyInputValid: boolean;
  reviewRequestValid: boolean;
  unsupportedFactLeakage: number;
  remoteMediaRequests: number;
  placeholderCount: number;
  repeatedOmittedQuestions: number;
  missingTier1: Tier1MissingField[];
  unexpectedFields: SparseCanonicalField[];
};

type CategoryDefinition = {
  category: SparseBusinessCategory;
  name: string;
  offer: string;
  richAudience: string;
  richStyle: string;
};

const CATEGORY_DEFINITIONS: readonly CategoryDefinition[] = [
  {
    category: "coffee",
    name: "Kedai Pagi",
    offer: "Kopi susu",
    richAudience: "Orang yang mencari minuman untuk jeda harian",
    richStyle: "Editorial hangat",
  },
  {
    category: "workshop",
    name: "Bengkel Sore",
    offer: "Servis motor",
    richAudience: "Pemilik motor harian",
    richStyle: "Tegas dan terstruktur",
  },
  {
    category: "catering",
    name: "Dapur Rantang",
    offer: "Catering rumahan",
    richAudience: "Keluarga dan acara kecil",
    richStyle: "Rapi dan ramah",
  },
  {
    category: "salon",
    name: "Ruang Rambut",
    offer: "Potong rambut",
    richAudience: "Orang yang ingin merapikan rambut",
    richStyle: "Bersih dan tenang",
  },
  {
    category: "laundry",
    name: "Cuci Bersih",
    offer: "Cuci pakaian",
    richAudience: "Warga sekitar yang membutuhkan laundry",
    richStyle: "Ringkas dan jelas",
  },
  {
    category: "grocery",
    name: "Toko Tetangga",
    offer: "Bahan kebutuhan harian",
    richAudience: "Tetangga yang berbelanja kebutuhan harian",
    richStyle: "Terang dan informatif",
  },
  {
    category: "artisan",
    name: "Karya Tangan",
    offer: "Kerajinan tangan",
    richAudience: "Orang yang mencari kerajinan untuk dipilih",
    richStyle: "Material dan editorial",
  },
  {
    category: "local_professional",
    name: "Konsultasi Dekat",
    offer: "Konsultasi usaha",
    richAudience: "Pemilik usaha yang ingin berdiskusi",
    richStyle: "Tenang dan terpercaya tanpa klaim",
  },
];

export const SPARSE_EVALUATION_CORPUS: readonly SparseEvaluationCase[] =
  CATEGORY_DEFINITIONS.flatMap((definition) =>
    SPARSE_CASE_CONDITIONS.map((condition) =>
      createEvaluationCase(definition, condition),
    ),
  );

export function evaluateSparseCase(
  evaluationCase: SparseEvaluationCase,
): SparseEvaluationResult {
  const brief = parseCanonicalBrief(evaluationCase.input);
  const readiness = evaluateTieredBriefReadiness(brief);
  const ledger = mergeFactLedger(
    createEmptyFactLedger(),
    createFactLedgerEntriesFromPatch(evaluationCase.input),
    { ownerTexts: [JSON.stringify(evaluationCase.input)] },
  );
  const renderableEntries = getRenderableFactEntries(ledger);
  const unexpectedFields = evaluationCase.expected.omittedFields.filter(
    (field) => hasCanonicalValue(brief, field),
  );
  const omissionStateValid = evaluationCase.expected.explicitOmissionIds.every(
    (id) => isExplicitlyOmitted(brief, id),
  );
  const truthBoundaryValid = ledger.entries.every(
    (entry) =>
      entry.origin !== "safe_derivation" || entry.state !== "owner_confirmed",
  );
  const strategyInputValid = designDirectionSchema.safeParse(
    createStrategyInput(brief),
  ).success;
  const reviewRequestValid = parseVisualReview(createReviewRequest()).ok;
  const unsupportedFactLeakage = renderableEntries.filter(
    (entry) =>
      entry.origin === "safe_derivation" || entry.origin === "design_only",
  ).length;
  const remoteMediaRequests = Array.isArray(
    evaluationCase.input.remoteMediaUrls,
  )
    ? evaluationCase.input.remoteMediaUrls.length
    : 0;
  const placeholderCount = Array.isArray(evaluationCase.input.mediaPlaceholders)
    ? evaluationCase.input.mediaPlaceholders.length
    : 0;
  const questionIds = Array.isArray(evaluationCase.input.questionIds)
    ? evaluationCase.input.questionIds.filter(
        (id): id is string => typeof id === "string",
      )
    : [];
  const repeatedOmittedQuestions =
    questionIds.length - new Set(questionIds).size;

  return {
    id: evaluationCase.id,
    category: evaluationCase.category,
    condition: evaluationCase.condition,
    ok:
      readiness.canBuild === evaluationCase.expected.tier1Satisfied &&
      readiness.tier1.missing.join(",") ===
        evaluationCase.expected.missingTier1.join(",") &&
      unexpectedFields.length === 0 &&
      omissionStateValid &&
      truthBoundaryValid &&
      strategyInputValid &&
      reviewRequestValid &&
      unsupportedFactLeakage === 0 &&
      remoteMediaRequests === 0 &&
      placeholderCount === 0 &&
      repeatedOmittedQuestions === 0,
    truthBoundaryValid,
    omissionStateValid,
    readinessValid:
      readiness.canBuild === evaluationCase.expected.tier1Satisfied &&
      readiness.tier1.missing.join(",") ===
        evaluationCase.expected.missingTier1.join(","),
    strategyInputValid,
    reviewRequestValid,
    unsupportedFactLeakage,
    remoteMediaRequests,
    placeholderCount,
    repeatedOmittedQuestions,
    missingTier1: readiness.tier1.missing,
    unexpectedFields,
  };
}

function createEvaluationCase(
  definition: CategoryDefinition,
  condition: SparseCaseCondition,
): SparseEvaluationCase {
  const input: Record<string, unknown> = {
    businessName: definition.name,
    contactOrCta: "Lihat pilihan",
    offer: definition.offer,
  };
  const explicitOmissionIds: string[] = [];

  if (condition === "rich") {
    input.targetCustomer = definition.richAudience;
    input.stylePreference = definition.richStyle;
    input.visitorJobs = [
      {
        goal: `Memilih ${definition.offer}`,
        id: "choose",
        priority: "primary",
      },
    ];
  }
  if (condition === "no_photo") {
    input.fieldState = { visuals: "declined" };
    explicitOmissionIds.push("visuals");
  }
  if (condition === "explicit_omission") {
    input.fieldState = {
      audience: "declined",
      visual_direction: "declined",
      visuals: "declined",
    };
    explicitOmissionIds.push("audience", "visual_direction", "visuals");
  }

  const omittedFields = SPARSE_CANONICAL_FIELDS.filter(
    (field) => !hasInputField(input, field),
  );
  const brief = parseCanonicalBrief(input);
  const readiness = evaluateTieredBriefReadiness(brief);

  return {
    id: `${definition.category}-${condition}`,
    category: definition.category,
    condition,
    input,
    expected: {
      tier1Satisfied: readiness.canBuild,
      missingTier1: readiness.tier1.missing,
      omittedFields,
      explicitOmissionIds,
    },
  };
}

function createStrategyInput(brief: ProjectBriefV2): DesignDirectionInput {
  const subject = brief.business.name || "usaha";
  return {
    contentArchitecture: `Susun informasi ${subject} dari penawaran ke tindakan.`,
    conversionThesis:
      "Satu tindakan utama terlihat setelah pengunjung memahami penawaran.",
    firstViewport: "Nama usaha dan penawaran utama memimpin layar pertama.",
    form: "Ritme editorial dengan ruang yang cukup",
    motionThesis:
      "Satu transisi masuk membantu orientasi tanpa menyembunyikan isi.",
    ownWorld:
      "Dunia visual dibangun dari tipografi, ritme, dan material yang tenang.",
    responsiveIntent:
      "Pada layar kecil, penawaran dan tindakan tetap berada di urutan pertama.",
    seedKey: "sparse-corpus",
    sparseDataStrategy:
      "Saat bukti usaha sedikit, gunakan struktur dan ruang tanpa menambah klaim.",
    story: "Pengunjung memahami penawaran lalu memilih tindakan yang tersedia.",
    thesis:
      "Bentuk yang terarah memberi bobot pada fakta yang benar-benar tersedia.",
  };
}

function createReviewRequest(): Record<string, unknown> {
  return {
    categories: VISUAL_REVIEW_CATEGORIES.map((category) => ({
      category,
      diagnosis: "none",
      rating: 3,
      severity: "none",
      state: "pass",
    })),
    confidence: 0.8,
    unresolvedP0P1: 0,
    version: 1,
  };
}

function hasInputField(
  input: Record<string, unknown>,
  field: SparseCanonicalField,
): boolean {
  switch (field) {
    case "audience":
      return typeof input.targetCustomer === "string";
    case "visualDirection":
      return typeof input.stylePreference === "string";
    case "assets":
      return Array.isArray(input.assets) && input.assets.length > 0;
    default:
      return Object.prototype.hasOwnProperty.call(input, field);
  }
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

function isExplicitlyOmitted(brief: ProjectBriefV2, id: string): boolean {
  const value = Object.entries(brief.fieldState).find(
    ([key]) => key === id,
  )?.[1];
  return value === "declined" || value === "explicitly_empty";
}
