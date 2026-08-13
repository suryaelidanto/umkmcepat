import type {
  GeneratedSiteDesignKitId,
  GeneratedSiteDesignKitV1,
  GeneratedSiteKitMediaMode,
} from "./generated-site-design-kits/types";

export type WriterDesignPlanV2 = {
  schemaVersion: 2;
  contractHash: string;
  kit: { id: GeneratedSiteDesignKitId; version: 1 };
  mediaMode: GeneratedSiteKitMediaMode;
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

export function parseWriterDesignPlanV2(input: {
  value: unknown;
  expected: {
    contractHash: string;
    kit: GeneratedSiteDesignKitV1;
    mediaMode: GeneratedSiteKitMediaMode;
    requiredSectionIds: string[];
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
