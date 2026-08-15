import {
  PROFESSIONAL_REVIEW_CATEGORIES,
  type ProfessionalReviewCategory,
} from "./professional-site-critic";

import type { GeneratedSiteCallBudgetSnapshot } from "./generated-site-call-budget";
import type { GeneratedSiteMediaMode } from "./generated-site-contract";
import type { GeneratedSiteDesignKitId } from "./generated-site-design-kits/types";

export type { GeneratedSiteDesignKitId } from "./generated-site-design-kits/types";

export type GeneratedSiteQualityProofV3 = {
  schemaVersion: 3;
  engine: "professional-static-single-shot";
  contractHash: string;
  blueprintHash: string;
  writerPlanHash: string | null;
  kitId: GeneratedSiteDesignKitId;
  kitVersion: 2;
  mediaMode: Exclude<GeneratedSiteMediaMode, "replaceable_slots">;
  calls: GeneratedSiteCallBudgetSnapshot;
  models: {
    writerRequested: string | null;
    writerServed: string | null;
    criticRequested: string | null;
    criticServed: string | null;
    correctionRequested: string | null;
    correctionServed: string | null;
  };
  gates: {
    response: "pass" | "fail" | "not_run";
    source: "pass" | "fail" | "not_run";
    build: "pass" | "fail" | "not_run";
    browser: "pass" | "fail" | "infrastructure_error" | "not_run";
    professionalVisual: "pass" | "fail" | "unknown" | "not_run";
  };
  hardFailures: {
    fact: number;
    action: number;
    media: number;
    accessibility: number;
    route: number;
    contract: number;
  };
  professional: {
    promptVersion: string | null;
    minimumRating: number | null;
    averageRating: number | null;
    categoryRatings: Partial<Record<ProfessionalReviewCategory, number>>;
    unknownReason: string | null;
  };
  timingsMs: {
    contract: number;
    blueprint: number;
    writer: number;
    sourceGates: number;
    build: number;
    browser: number;
    critic: number;
    correction: number;
    totalToDecision: number;
  };
  output: {
    routeCount: number;
    editableFileCount: number;
    editableBytes: number;
    firstFileClosedMs: number | null;
  };
  outcome: "pass" | "fail" | "infrastructure_error";
};

const PROFESSIONAL_CORRECTION_REASONS = new Set([
  "transport",
  "response_contract",
  "source_gate",
  "build",
  "browser",
]);

export function createEmptyGeneratedSiteQualityProofV3(input: {
  contractHash: string;
  blueprintHash: string;
  kitId: GeneratedSiteDesignKitId;
  mediaMode: Exclude<GeneratedSiteMediaMode, "replaceable_slots">;
}): GeneratedSiteQualityProofV3 {
  return {
    schemaVersion: 3,
    engine: "professional-static-single-shot",
    contractHash: input.contractHash,
    blueprintHash: input.blueprintHash,
    writerPlanHash: null,
    kitId: input.kitId,
    kitVersion: 2,
    mediaMode: input.mediaMode,
    calls: {
      writerCalls: 0,
      criticCalls: 0,
      correctionCalls: 0,
      correctionReason: null,
    },
    models: {
      writerRequested: null,
      writerServed: null,
      criticRequested: null,
      criticServed: null,
      correctionRequested: null,
      correctionServed: null,
    },
    gates: {
      response: "not_run",
      source: "not_run",
      build: "not_run",
      browser: "not_run",
      professionalVisual: "not_run",
    },
    hardFailures: {
      fact: 0,
      action: 0,
      media: 0,
      accessibility: 0,
      route: 0,
      contract: 0,
    },
    professional: {
      promptVersion: null,
      minimumRating: null,
      averageRating: null,
      categoryRatings: {},
      unknownReason: null,
    },
    timingsMs: {
      contract: 0,
      blueprint: 0,
      writer: 0,
      sourceGates: 0,
      build: 0,
      browser: 0,
      critic: 0,
      correction: 0,
      totalToDecision: 0,
    },
    output: {
      routeCount: 0,
      editableFileCount: 0,
      editableBytes: 0,
      firstFileClosedMs: null,
    },
    outcome: "fail",
  };
}

export function sanitizeGeneratedSiteQualityProofV3(
  value: GeneratedSiteQualityProofV3,
): GeneratedSiteQualityProofV3 {
  validateBaseProof(value);
  if (value.outcome === "pass") {
    if (
      value.gates.response !== "pass" ||
      value.gates.source !== "pass" ||
      value.gates.build !== "pass" ||
      value.gates.browser !== "pass"
    ) {
      throw new Error(
        "professional quality proof pass requires every deterministic gate",
      );
    }
    if (value.gates.professionalVisual !== "pass") {
      throw new Error(
        "professional quality proof pass requires professional visual pass",
      );
    }
    if (Object.values(value.hardFailures).some((count) => count !== 0)) {
      throw new Error(
        "professional quality proof pass requires zero hard failures",
      );
    }
    if (value.calls.writerCalls !== 1 || value.calls.criticCalls !== 1) {
      throw new Error(
        "professional quality proof pass requires one writer and one critic",
      );
    }
    if (
      !value.models.writerRequested ||
      !value.models.writerServed ||
      !value.models.criticRequested ||
      !value.models.criticServed
    ) {
      throw new Error(
        "professional quality proof pass requires authorized writer and critic models",
      );
    }
    if (
      value.professional.unknownReason !== null ||
      value.professional.minimumRating === null ||
      value.professional.minimumRating < 3
    ) {
      throw new Error(
        "professional quality proof pass requires professional ratings >= 3",
      );
    }
    for (const category of PROFESSIONAL_REVIEW_CATEGORIES) {
      const rating = value.professional.categoryRatings[category];
      if (rating === undefined || rating < 3) {
        throw new Error(
          "professional quality proof pass requires all professional categories",
        );
      }
    }
  }
  return {
    schemaVersion: 3,
    engine: "professional-static-single-shot",
    contractHash: value.contractHash,
    blueprintHash: value.blueprintHash,
    writerPlanHash: value.writerPlanHash,
    kitId: value.kitId,
    kitVersion: 2,
    mediaMode: value.mediaMode,
    calls: {
      writerCalls: value.calls.writerCalls,
      criticCalls: value.calls.criticCalls,
      correctionCalls: value.calls.correctionCalls,
      correctionReason: value.calls.correctionReason,
    },
    models: {
      writerRequested: value.models.writerRequested,
      writerServed: value.models.writerServed,
      criticRequested: value.models.criticRequested,
      criticServed: value.models.criticServed,
      correctionRequested: value.models.correctionRequested,
      correctionServed: value.models.correctionServed,
    },
    gates: {
      response: value.gates.response,
      source: value.gates.source,
      build: value.gates.build,
      browser: value.gates.browser,
      professionalVisual: value.gates.professionalVisual,
    },
    hardFailures: {
      fact: value.hardFailures.fact,
      action: value.hardFailures.action,
      media: value.hardFailures.media,
      accessibility: value.hardFailures.accessibility,
      route: value.hardFailures.route,
      contract: value.hardFailures.contract,
    },
    professional: {
      promptVersion: value.professional.promptVersion,
      minimumRating: value.professional.minimumRating,
      averageRating: value.professional.averageRating,
      categoryRatings: sanitizeCategoryRatings(
        value.professional.categoryRatings,
      ),
      unknownReason: value.professional.unknownReason,
    },
    timingsMs: {
      contract: value.timingsMs.contract,
      blueprint: value.timingsMs.blueprint,
      writer: value.timingsMs.writer,
      sourceGates: value.timingsMs.sourceGates,
      build: value.timingsMs.build,
      browser: value.timingsMs.browser,
      critic: value.timingsMs.critic,
      correction: value.timingsMs.correction,
      totalToDecision: value.timingsMs.totalToDecision,
    },
    output: {
      routeCount: value.output.routeCount,
      editableFileCount: value.output.editableFileCount,
      editableBytes: value.output.editableBytes,
      firstFileClosedMs: value.output.firstFileClosedMs,
    },
    outcome: value.outcome,
  };
}

export function createProfessionalSiteQualityProof(input: {
  base: GeneratedSiteQualityProofV3;
  patch: Partial<GeneratedSiteQualityProofV3>;
}): GeneratedSiteQualityProofV3 {
  return sanitizeGeneratedSiteQualityProofV3({
    ...input.base,
    ...input.patch,
    calls: { ...input.base.calls, ...input.patch.calls },
    models: { ...input.base.models, ...input.patch.models },
    gates: { ...input.base.gates, ...input.patch.gates },
    hardFailures: { ...input.base.hardFailures, ...input.patch.hardFailures },
    professional: { ...input.base.professional, ...input.patch.professional },
    timingsMs: { ...input.base.timingsMs, ...input.patch.timingsMs },
    output: { ...input.base.output, ...input.patch.output },
  });
}

function validateBaseProof(value: GeneratedSiteQualityProofV3): void {
  if (
    value.schemaVersion !== 3 ||
    value.engine !== "professional-static-single-shot" ||
    typeof value.contractHash !== "string" ||
    typeof value.blueprintHash !== "string" ||
    value.kitVersion !== 2 ||
    !["owner_assets", "graphic", "typographic"].includes(value.mediaMode) ||
    !["pass", "fail", "infrastructure_error"].includes(value.outcome) ||
    !["pass", "fail", "not_run"].includes(value.gates.response) ||
    !["pass", "fail", "not_run"].includes(value.gates.source) ||
    !["pass", "fail", "not_run"].includes(value.gates.build) ||
    !["pass", "fail", "infrastructure_error", "not_run"].includes(
      value.gates.browser,
    ) ||
    !["pass", "fail", "unknown", "not_run"].includes(
      value.gates.professionalVisual,
    )
  ) {
    throw new Error("professional quality proof identity is invalid");
  }
  assertCallCount(value.calls.writerCalls, "writer");
  assertCallCount(value.calls.criticCalls, "critic");
  assertCallCount(value.calls.correctionCalls, "correction");
  if (
    value.calls.correctionCalls === 0 &&
    value.calls.correctionReason !== null
  ) {
    throw new Error(
      "professional quality proof correction reason requires one correction",
    );
  }
  if (
    value.calls.correctionReason !== null &&
    !PROFESSIONAL_CORRECTION_REASONS.has(value.calls.correctionReason)
  ) {
    throw new Error("professional quality proof correction reason is invalid");
  }
  for (const model of Object.values(value.models)) {
    if (model !== null && (typeof model !== "string" || model.trim() === "")) {
      throw new Error("professional quality proof model ID is invalid");
    }
  }
  for (const count of Object.values(value.hardFailures)) {
    assertNonNegativeInteger(count, "hard failure count");
  }
  for (const timing of Object.values(value.timingsMs)) {
    assertNonNegativeFinite(timing, "timing");
  }
  assertNonNegativeInteger(value.output.routeCount, "route count");
  assertNonNegativeInteger(
    value.output.editableFileCount,
    "editable file count",
  );
  assertNonNegativeInteger(value.output.editableBytes, "editable byte count");
  if (value.output.firstFileClosedMs !== null) {
    assertNonNegativeFinite(
      value.output.firstFileClosedMs,
      "first file timing",
    );
  }
  if (
    value.writerPlanHash !== null &&
    typeof value.writerPlanHash !== "string"
  ) {
    throw new Error("professional quality proof writer plan hash is invalid");
  }
  if (
    value.professional.unknownReason !== null &&
    typeof value.professional.unknownReason !== "string"
  ) {
    throw new Error("professional quality proof unknown reason is invalid");
  }
  if (
    value.professional.minimumRating !== null &&
    (!Number.isInteger(value.professional.minimumRating) ||
      value.professional.minimumRating < 1 ||
      value.professional.minimumRating > 4)
  ) {
    throw new Error("professional quality proof minimum rating is invalid");
  }
  if (
    value.professional.averageRating !== null &&
    (!Number.isFinite(value.professional.averageRating) ||
      value.professional.averageRating < 1 ||
      value.professional.averageRating > 4)
  ) {
    throw new Error("professional quality proof average rating is invalid");
  }
  for (const [category, rating] of Object.entries(
    value.professional.categoryRatings,
  )) {
    if (
      !PROFESSIONAL_REVIEW_CATEGORIES.includes(
        category as ProfessionalReviewCategory,
      ) ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 4
    ) {
      throw new Error("professional quality proof category rating is invalid");
    }
  }
}

function sanitizeCategoryRatings(
  ratings: Partial<Record<ProfessionalReviewCategory, number>>,
): Partial<Record<ProfessionalReviewCategory, number>> {
  const sanitized: Partial<Record<ProfessionalReviewCategory, number>> = {};
  for (const category of PROFESSIONAL_REVIEW_CATEGORIES) {
    const rating = ratings[category];
    if (rating !== undefined) {
      sanitized[category] = rating;
    }
  }
  return sanitized;
}

function assertCallCount(value: number, leg: string): asserts value is 0 | 1 {
  if (value !== 0 && value !== 1) {
    throw new Error(
      `professional quality proof call count exceeds budget: ${leg}`,
    );
  }
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`professional quality proof ${label} is invalid`);
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`professional quality proof ${label} is invalid`);
  }
}
