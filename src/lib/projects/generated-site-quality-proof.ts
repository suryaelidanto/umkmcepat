import type { GeneratedSiteDesignKitId } from "./generated-site-design-kits/types";

export type { GeneratedSiteDesignKitId } from "./generated-site-design-kits/types";

export type GeneratedSiteMediaModeV2 =
  "owner_assets" | "graphic" | "typographic";

export type GeneratedSiteQualityProofV2 = {
  schemaVersion: 2;
  engine: "reference-calibrated-single-shot";
  contractHash: string;
  planHash: string;
  kitId: GeneratedSiteDesignKitId;
  kitVersion: 1;
  designPlanHash: string | null;
  mediaMode: GeneratedSiteMediaModeV2;
  calls: {
    writerCalls: 0 | 1;
    criticCalls: 0 | 1;
    correctionCalls: 0 | 1;
    correctionReason: string | null;
  };
  gates: {
    response: "pass" | "fail" | "not_run";
    source: "pass" | "fail" | "not_run";
    build: "pass" | "fail" | "not_run";
    browser: "pass" | "fail" | "infrastructure_error" | "not_run";
    visual: "pass" | "fail" | "unknown" | "not_run";
  };
  visualFindings: Record<"critical" | "high" | "medium" | "low", number>;
  timingsMs: {
    contract: number;
    writer: number;
    sourceGates: number;
    build: number;
    browser: number;
    critic: number;
    correction: number;
    totalToDecision: number;
  };
  output: {
    editableFileCount: number;
    editableBytes: number;
    firstFileClosedMs: number | null;
  };
  outcome: "pass" | "fail" | "infrastructure_error";
};

const PASS_GATES = ["pass"] as const;

export function createEmptyGeneratedSiteQualityProofV2(input: {
  contractHash: string;
  planHash: string;
  kitId: GeneratedSiteDesignKitId;
  mediaMode: GeneratedSiteMediaModeV2;
}): GeneratedSiteQualityProofV2 {
  return {
    schemaVersion: 2,
    engine: "reference-calibrated-single-shot",
    contractHash: input.contractHash,
    planHash: input.planHash,
    kitId: input.kitId,
    kitVersion: 1,
    designPlanHash: null,
    mediaMode: input.mediaMode,
    calls: {
      writerCalls: 0,
      criticCalls: 0,
      correctionCalls: 0,
      correctionReason: null,
    },
    gates: {
      response: "not_run",
      source: "not_run",
      build: "not_run",
      browser: "not_run",
      visual: "not_run",
    },
    visualFindings: { critical: 0, high: 0, medium: 0, low: 0 },
    timingsMs: {
      contract: 0,
      writer: 0,
      sourceGates: 0,
      build: 0,
      browser: 0,
      critic: 0,
      correction: 0,
      totalToDecision: 0,
    },
    output: {
      editableFileCount: 0,
      editableBytes: 0,
      firstFileClosedMs: null,
    },
    outcome: "fail",
  };
}

export function sanitizeGeneratedSiteQualityProofV2(
  value: GeneratedSiteQualityProofV2,
): GeneratedSiteQualityProofV2 {
  assertCallCount(value.calls.writerCalls, "writer");
  assertCallCount(value.calls.criticCalls, "critic");
  assertCallCount(value.calls.correctionCalls, "correction");
  const correctionReasons = new Set([
    "transport",
    "response_contract",
    "source_gate",
    "build",
    "browser",
    "visual_machine_verifiable",
  ]);
  if (
    value.calls.correctionReason !== null &&
    !correctionReasons.has(value.calls.correctionReason)
  ) {
    throw new Error("quality proof correction reason is not recognized");
  }
  if (
    value.calls.correctionCalls === 0 &&
    value.calls.correctionReason !== null
  ) {
    throw new Error(
      "quality proof correction reason requires a correction call",
    );
  }
  if (value.outcome === "pass") {
    const gates = [
      value.gates.response,
      value.gates.source,
      value.gates.build,
      value.gates.browser,
      value.gates.visual,
    ];
    if (
      gates.some(
        (gate) => !PASS_GATES.includes(gate as (typeof PASS_GATES)[number]),
      ) ||
      value.visualFindings.critical > 0 ||
      value.visualFindings.high > 0
    ) {
      throw new Error("quality proof pass requires every gate");
    }
  }
  return {
    schemaVersion: 2,
    engine: "reference-calibrated-single-shot",
    contractHash: value.contractHash,
    planHash: value.planHash,
    kitId: value.kitId,
    kitVersion: 1,
    designPlanHash: value.designPlanHash,
    mediaMode: value.mediaMode,
    calls: { ...value.calls },
    gates: { ...value.gates },
    visualFindings: { ...value.visualFindings },
    timingsMs: { ...value.timingsMs },
    output: { ...value.output },
    outcome: value.outcome,
  };
}

function assertCallCount(value: number, leg: string): asserts value is 0 | 1 {
  if (value !== 0 && value !== 1) {
    throw new Error(`quality proof call count exceeds budget: ${leg}`);
  }
}
