import type {
  GeneratedSiteDesignKitId,
  GeneratedSiteDesignKitV1,
  GeneratedSiteKitMediaMode,
  GeneratedSiteTasteProfile,
} from "./generated-site-design-kits/types";
import type { GeneratedSitePageStrategy } from "./generated-site-design-quality";

export type WriterDesignPlanV2 = {
  schemaVersion: 2;
  contractHash: string;
  kit: { id: GeneratedSiteDesignKitId; version: 1 };
  mediaMode: GeneratedSiteKitMediaMode;
  pageStrategy: GeneratedSitePageStrategy["mode"];
  taste: GeneratedSiteTasteProfile;
  visualThesis: string;
  compositionPatternId: string;
  palette: {
    background: string;
    foreground: string;
    muted: string;
    accent: string;
  };
  typography: {
    displayRole: "serif" | "sans";
    bodyRole: "sans" | "serif";
  };
  sections: Array<{
    id: string;
    treatment: string;
    surface: "base" | "muted" | "contrast";
    density: "compact" | "regular" | "airy";
  }>;
  sectionOrder: string[];
  mobileStrategy: string[];
  signatureElement: string;
};

const KIT_IDS = [
  "editorial-airy",
  "menu-led-editorial",
  "catalog-story",
  "warm-commerce",
  "bold-typographic",
] as const;
const MEDIA_MODES = ["owner_assets", "graphic", "typographic"] as const;
const SURFACES = ["base", "muted", "contrast"] as const;
const DENSITIES = ["compact", "regular", "airy"] as const;
const ROLES = ["serif", "sans"] as const;
const HEX = /^#[0-9a-f]{6}$/i;

type WriterDesignPlanV2FrameInput = {
  contractHash: string;
  kit: GeneratedSiteDesignKitV1;
  mediaMode: GeneratedSiteKitMediaMode;
  requiredSectionIds: string[];
  pageStrategy?: GeneratedSitePageStrategy["mode"];
  taste?: GeneratedSiteTasteProfile;
  palette?: WriterDesignPlanV2["palette"];
};

export function deriveDefaultWriterDesignPlanV2(
  input: WriterDesignPlanV2FrameInput,
): WriterDesignPlanV2 {
  if (input.requiredSectionIds.length === 0) {
    throw new Error("V2 design-plan requires at least one section");
  }
  const pattern = input.kit.compositionPatterns[0];
  if (!pattern) {
    throw new Error(
      `generated-site kit has no composition pattern: ${input.kit.id}`,
    );
  }
  const palette =
    input.palette && validPalette(input.palette)
      ? input.palette
      : defaultPalette(input.kit);
  return {
    schemaVersion: 2,
    contractHash: input.contractHash,
    kit: { id: input.kit.id, version: 1 },
    mediaMode: input.mediaMode,
    pageStrategy: input.pageStrategy ?? "single",
    taste: input.taste ?? input.kit.taste,
    visualThesis: pattern.intent,
    compositionPatternId: pattern.id,
    palette,
    typography: {
      displayRole: input.kit.typography.displayRole,
      bodyRole: input.kit.typography.bodyRole,
    },
    sections: input.requiredSectionIds.map((id, index) => ({
      id,
      treatment: "content-led",
      surface: sectionSurface(input.kit, index),
      density: input.requiredSectionIds.length === 1 ? "airy" : "regular",
    })),
    sectionOrder: [...input.requiredSectionIds],
    mobileStrategy: ["stack sections", "keep the primary action visible"],
    signatureElement: pattern.id,
  };
}

export function mergeWriterDesignPlanV2(input: {
  frame: WriterDesignPlanV2;
  candidate: WriterDesignPlanV2;
}): WriterDesignPlanV2 {
  const candidateSections = new Map(
    input.candidate.sections.map((section) => [section.id, section]),
  );
  return {
    ...input.frame,
    visualThesis: input.candidate.visualThesis,
    sections: input.frame.sections.map((section) => ({
      ...section,
      treatment:
        candidateSections.get(section.id)?.treatment ?? section.treatment,
    })),
    signatureElement: input.candidate.signatureElement,
  };
}

function validPalette(palette: WriterDesignPlanV2["palette"]): boolean {
  return Object.values(palette).every((value) => HEX.test(value));
}

function defaultPalette(
  kit: GeneratedSiteDesignKitV1,
): WriterDesignPlanV2["palette"] {
  if (kit.themePolicy.backgroundLightness === "dark") {
    return {
      background: "#171b2b",
      foreground: "#f3f4ff",
      muted: "#2c3150",
      accent: "#9d7cff",
    };
  }
  return {
    background: "#f7f3ec",
    foreground: "#3d2b1f",
    muted: "#e5ddd2",
    accent: "#d4a017",
  };
}

function sectionSurface(
  kit: GeneratedSiteDesignKitV1,
  index: number,
): WriterDesignPlanV2["sections"][number]["surface"] {
  if (!kit.rhythm.allowAlternatingSurfaces) {
    return "base";
  }
  return index % 3 === 1 ? "muted" : index % 3 === 2 ? "contrast" : "base";
}

export function normalizeWriterDesignPlanV2Candidate(input: {
  value: unknown;
  frame: WriterDesignPlanV2;
}): unknown {
  if (!isRecord(input.value)) {
    return input.value;
  }
  const rawSections = Array.isArray(input.value.sections)
    ? input.value.sections
    : [];
  const candidateSections = new Map(
    rawSections
      .filter(isRecord)
      .filter((section) => typeof section.id === "string")
      .map((section) => [section.id, section]),
  );
  return {
    schemaVersion: input.frame.schemaVersion,
    contractHash: input.frame.contractHash,
    kit: input.frame.kit,
    mediaMode: input.frame.mediaMode,
    pageStrategy: input.frame.pageStrategy,
    taste: input.frame.taste,
    compositionPatternId: input.frame.compositionPatternId,
    palette: input.frame.palette,
    typography: input.frame.typography,
    mobileStrategy: input.frame.mobileStrategy,
    visualThesis:
      typeof input.value.visualThesis === "string" &&
      input.value.visualThesis.trim().length >= 12
        ? input.value.visualThesis
        : input.frame.visualThesis,
    sections: input.frame.sections.map((section) => ({
      ...section,
      treatment:
        stringValue(candidateSections.get(section.id)?.treatment).trim() ||
        section.treatment,
    })),
    signatureElement:
      stringValue(input.value.signatureElement).trim() ||
      input.frame.signatureElement,
  };
}

export function parseWriterDesignPlanV2(input: {
  value: unknown;
  expected: {
    contractHash: string;
    kit: GeneratedSiteDesignKitV1;
    mediaMode: GeneratedSiteKitMediaMode;
    requiredSectionIds: string[];
    pageStrategy?: GeneratedSitePageStrategy["mode"];
  };
}): WriterDesignPlanV2 {
  if (!isRecord(input.value)) {
    throw new Error("invalid V2 design-plan object");
  }
  if (JSON.stringify(input.value).length > 8_192) {
    throw new Error("V2 design-plan exceeds 8192 characters");
  }
  const plan = input.value;
  const allowed = new Set([
    "schemaVersion",
    "contractHash",
    "kit",
    "mediaMode",
    "pageStrategy",
    "taste",
    "visualThesis",
    "compositionPatternId",
    "palette",
    "typography",
    "sections",
    "mobileStrategy",
    "signatureElement",
  ]);
  if (Object.keys(input.value).some((key) => !allowed.has(key))) {
    throw new Error("invalid V2 design-plan fields");
  }
  const kitValue = input.value.kit;
  const paletteValue = input.value.palette;
  const typographyValue = input.value.typography;
  if (
    input.value.schemaVersion !== 2 ||
    input.value.contractHash !== input.expected.contractHash ||
    !isRecord(kitValue) ||
    !isRecord(paletteValue) ||
    !isRecord(typographyValue) ||
    typeof input.value.mediaMode !== "string" ||
    !MEDIA_MODES.includes(
      input.value.mediaMode as (typeof MEDIA_MODES)[number],
    ) ||
    input.value.mediaMode !== input.expected.mediaMode ||
    (input.value.pageStrategy !== "single" &&
      input.value.pageStrategy !== "multi") ||
    !isTasteProfile(input.value.taste) ||
    typeof input.value.visualThesis !== "string" ||
    input.value.visualThesis.trim().length < 12 ||
    typeof input.value.compositionPatternId !== "string" ||
    typeof input.value.signatureElement !== "string" ||
    input.value.signatureElement.trim().length === 0 ||
    !stringArray(input.value.mobileStrategy) ||
    input.value.mobileStrategy.length === 0 ||
    !Array.isArray(input.value.sections)
  ) {
    throw new Error("invalid V2 design-plan shape");
  }
  if (
    kitValue.version !== 1 ||
    typeof kitValue.id !== "string" ||
    !KIT_IDS.includes(kitValue.id as (typeof KIT_IDS)[number]) ||
    kitValue.id !== input.expected.kit.id
  ) {
    throw new Error("V2 design-plan kit mismatch");
  }
  if (
    !HEX.test(stringValue(paletteValue.background)) ||
    !HEX.test(stringValue(paletteValue.foreground)) ||
    !HEX.test(stringValue(paletteValue.muted)) ||
    !HEX.test(stringValue(paletteValue.accent))
  ) {
    throw new Error("invalid V2 design-plan palette");
  }
  if (
    typeof typographyValue.displayRole !== "string" ||
    !ROLES.includes(typographyValue.displayRole as (typeof ROLES)[number]) ||
    typeof typographyValue.bodyRole !== "string" ||
    !ROLES.includes(typographyValue.bodyRole as (typeof ROLES)[number])
  ) {
    throw new Error("invalid V2 design-plan typography");
  }
  if (
    input.expected.pageStrategy &&
    plan.pageStrategy !== input.expected.pageStrategy
  ) {
    throw new Error("V2 design-plan page strategy mismatch");
  }
  if (JSON.stringify(plan.taste) !== JSON.stringify(input.expected.kit.taste)) {
    throw new Error("V2 design-plan taste profile mismatch");
  }
  const contractHash = expectString(plan.contractHash, "contract hash");
  const visualThesis = expectString(plan.visualThesis, "visual thesis");
  const compositionPatternId = expectString(
    plan.compositionPatternId,
    "composition pattern",
  );
  const mobileStrategy = expectStringArray(
    plan.mobileStrategy,
    "mobile strategy",
  );
  const signatureElement = expectString(
    plan.signatureElement,
    "signature element",
  );
  const rawSections = plan.sections;
  if (!Array.isArray(rawSections)) {
    throw new Error("invalid V2 design-plan sections");
  }
  const sections = rawSections.map((section) => parseSection(section));
  const sectionOrder = sections.map((section) => section.id);
  if (
    new Set(sectionOrder).size !== sectionOrder.length ||
    input.expected.requiredSectionIds.some(
      (id) => !sectionOrder.includes(id),
    ) ||
    !input.expected.kit.compositionPatterns.some(
      (pattern) => pattern.id === compositionPatternId,
    )
  ) {
    throw new Error("V2 design-plan section or pattern mismatch");
  }
  return {
    schemaVersion: 2,
    contractHash,
    kit: {
      id: kitValue.id as GeneratedSiteDesignKitId,
      version: 1,
    },
    mediaMode: plan.mediaMode as GeneratedSiteKitMediaMode,
    pageStrategy: plan.pageStrategy as GeneratedSitePageStrategy["mode"],
    taste: plan.taste as GeneratedSiteTasteProfile,
    visualThesis,
    compositionPatternId,
    palette: {
      background: paletteValue.background as string,
      foreground: paletteValue.foreground as string,
      muted: paletteValue.muted as string,
      accent: paletteValue.accent as string,
    },
    typography: {
      displayRole: typographyValue.displayRole as "serif" | "sans",
      bodyRole: typographyValue.bodyRole as "sans" | "serif",
    },
    sections,
    sectionOrder,
    mobileStrategy,
    signatureElement,
  };
}

function parseSection(value: unknown): WriterDesignPlanV2["sections"][number] {
  if (!isRecord(value)) {
    throw new Error("invalid V2 design-plan section");
  }
  if (
    typeof value.id !== "string" ||
    value.id.trim().length === 0 ||
    typeof value.treatment !== "string" ||
    value.treatment.trim().length === 0 ||
    typeof value.surface !== "string" ||
    !SURFACES.includes(value.surface as (typeof SURFACES)[number]) ||
    typeof value.density !== "string" ||
    !DENSITIES.includes(value.density as (typeof DENSITIES)[number])
  ) {
    throw new Error("invalid V2 design-plan section");
  }
  return {
    id: value.id,
    treatment: value.treatment,
    surface: value.surface as WriterDesignPlanV2["sections"][number]["surface"],
    density: value.density as WriterDesignPlanV2["sections"][number]["density"],
  };
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`invalid V2 design-plan ${label}`);
  }
  return value;
}

function expectStringArray(value: unknown, label: string): string[] {
  if (!stringArray(value) || value.length === 0) {
    throw new Error(`invalid V2 design-plan ${label}`);
  }
  return value;
}

function isTasteProfile(value: unknown): value is GeneratedSiteTasteProfile {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.variance === "number" &&
    value.variance >= 1 &&
    value.variance <= 10 &&
    typeof value.motion === "number" &&
    value.motion >= 1 &&
    value.motion <= 10 &&
    typeof value.density === "number" &&
    value.density >= 1 &&
    value.density <= 10 &&
    (value.shape === "sharp" ||
      value.shape === "soft" ||
      value.shape === "pill") &&
    typeof value.typeGuidance === "string" &&
    value.typeGuidance.trim().length > 0 &&
    value.signatureBudget === 1
  );
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value;
}

function stringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
