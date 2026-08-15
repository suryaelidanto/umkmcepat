import type { ProfessionalSiteBlueprintV1 } from "./professional-site-blueprint";
import type {
  GeneratedSiteDesignKitV2,
  ProfessionalFontStackId,
} from "./professional-site-kits";

export type WriterDesignPlanV3 = {
  schemaVersion: 3;
  blueprintHash: string;
  visualThesis: string;
  signature: {
    route: string;
    description: string;
    sourceAnchor:
      "offer" | "product" | "process" | "place" | "craft" | "audience";
  };
  typography: {
    displayStackId: ProfessionalFontStackId;
    bodyStackId: ProfessionalFontStackId;
  };
  palette: {
    background: string;
    foreground: string;
    muted: string;
    accent: string;
  };
  routes: Array<{
    path: string;
    patternId: string;
    sections: Array<{
      id: string;
      treatment: string;
      surface: "base" | "muted" | "contrast";
      density: "compact" | "regular" | "airy";
    }>;
  }>;
  mobileTransforms: Array<{
    route: string;
    pattern: string;
    transform: string;
  }>;
};

const SURFACES = ["base", "muted", "contrast"] as const;
const DENSITIES = ["compact", "regular", "airy"] as const;
const FONT_STACKS = [
  "editorial-serif",
  "humanist-sans",
  "geometric-sans",
  "restrained-grotesk",
] as const;
const SIGNATURE_ANCHORS = [
  "offer",
  "product",
  "process",
  "place",
  "craft",
  "audience",
] as const;
const HEX = /^#[0-9a-f]{6}$/i;

export function parseWriterDesignPlanV3(input: {
  value: unknown;
  blueprint: ProfessionalSiteBlueprintV1;
  kit: GeneratedSiteDesignKitV2;
}): WriterDesignPlanV3 {
  if (!isRecord(input.value)) {
    throw new Error("invalid V3 design-plan object");
  }
  if (input.kit.id !== input.blueprint.kit.id || input.kit.version !== 2) {
    throw new Error("V3 design-plan kit does not match blueprint");
  }
  const serialized = JSON.stringify(input.value);
  if (Buffer.byteLength(serialized, "utf8") > 6_144) {
    throw new Error("V3 design-plan exceeds 6144 bytes");
  }
  assertExactKeys(
    input.value,
    [
      "schemaVersion",
      "blueprintHash",
      "visualThesis",
      "signature",
      "typography",
      "palette",
      "routes",
      "mobileTransforms",
    ],
    "V3 design-plan",
  );

  const signature = parseSignature(input.value.signature, input);
  const typography = parseTypography(input.value.typography, input.kit);
  const palette = parsePalette(input.value.palette);
  const routes = parseRoutes(input.value.routes, input.blueprint, input.kit);
  const mobileTransforms = parseMobileTransforms(
    input.value.mobileTransforms,
    routes,
    input.blueprint,
    input.kit,
  );

  if (
    input.value.schemaVersion !== 3 ||
    typeof input.value.blueprintHash !== "string" ||
    input.value.blueprintHash !== input.blueprint.blueprintHash ||
    typeof input.value.visualThesis !== "string" ||
    input.value.visualThesis.trim().length < 12
  ) {
    throw new Error("invalid V3 design-plan identity");
  }

  return {
    schemaVersion: 3,
    blueprintHash: input.value.blueprintHash,
    visualThesis: input.value.visualThesis,
    signature,
    typography,
    palette,
    routes,
    mobileTransforms,
  };
}

function parseSignature(
  value: unknown,
  input: {
    blueprint: ProfessionalSiteBlueprintV1;
    kit: GeneratedSiteDesignKitV2;
  },
): WriterDesignPlanV3["signature"] {
  if (!isRecord(value)) {
    throw new Error("invalid V3 signature");
  }
  assertExactKeys(
    value,
    ["route", "description", "sourceAnchor"],
    "V3 signature",
  );
  if (
    typeof value.route !== "string" ||
    typeof value.description !== "string" ||
    value.description.trim().length === 0 ||
    typeof value.sourceAnchor !== "string" ||
    !isSignatureAnchor(value.sourceAnchor) ||
    !input.kit.allowedSignatureAnchors.includes(value.sourceAnchor) ||
    !input.blueprint.artDirection.signature.mustReference.includes(
      value.sourceAnchor,
    ) ||
    !input.blueprint.routes.some((route) => route.path === value.route) ||
    value.route !== input.blueprint.signatureRoute
  ) {
    throw new Error("V3 design-plan signature does not match blueprint");
  }
  return {
    route: value.route,
    description: value.description,
    sourceAnchor: value.sourceAnchor,
  };
}

function parseTypography(
  value: unknown,
  kit: GeneratedSiteDesignKitV2,
): WriterDesignPlanV3["typography"] {
  if (!isRecord(value)) {
    throw new Error("invalid V3 typography");
  }
  assertExactKeys(value, ["displayStackId", "bodyStackId"], "V3 typography");
  if (
    typeof value.displayStackId !== "string" ||
    !isFontStackId(value.displayStackId) ||
    !kit.typography.allowedDisplayStackIds.includes(value.displayStackId) ||
    typeof value.bodyStackId !== "string" ||
    value.bodyStackId !== kit.typography.bodyStackId
  ) {
    throw new Error("V3 design-plan typography is outside kit policy");
  }
  return {
    displayStackId: value.displayStackId,
    bodyStackId: kit.typography.bodyStackId,
  };
}

function parsePalette(value: unknown): WriterDesignPlanV3["palette"] {
  if (!isRecord(value)) {
    throw new Error("invalid V3 palette");
  }
  assertExactKeys(
    value,
    ["background", "foreground", "muted", "accent"],
    "V3 palette",
  );
  if (
    typeof value.background !== "string" ||
    typeof value.foreground !== "string" ||
    typeof value.muted !== "string" ||
    typeof value.accent !== "string" ||
    !HEX.test(value.background) ||
    !HEX.test(value.foreground) ||
    !HEX.test(value.muted) ||
    !HEX.test(value.accent)
  ) {
    throw new Error("invalid V3 design-plan palette");
  }
  return {
    background: value.background,
    foreground: value.foreground,
    muted: value.muted,
    accent: value.accent,
  };
}

function parseRoutes(
  value: unknown,
  blueprint: ProfessionalSiteBlueprintV1,
  kit: GeneratedSiteDesignKitV2,
): WriterDesignPlanV3["routes"] {
  if (!Array.isArray(value) || value.length !== blueprint.routes.length) {
    throw new Error("V3 design-plan route count mismatch");
  }
  return value.map((rawRoute, index) => {
    if (!isRecord(rawRoute)) {
      throw new Error("invalid V3 design-plan route");
    }
    assertExactKeys(rawRoute, ["path", "patternId", "sections"], "V3 route");
    const blueprintRoute = blueprint.routes[index];
    if (
      !blueprintRoute ||
      rawRoute.path !== blueprintRoute.path ||
      typeof rawRoute.patternId !== "string" ||
      !blueprintRoute.allowedPatternIds.includes(rawRoute.patternId)
    ) {
      throw new Error("V3 design-plan route pattern mismatch");
    }
    const pattern = kit.compositionPatterns.find(
      (candidate) => candidate.id === rawRoute.patternId,
    );
    if (!pattern) {
      throw new Error("V3 design-plan selected pattern is not in kit");
    }
    if (
      !Array.isArray(rawRoute.sections) ||
      rawRoute.sections.length !== blueprintRoute.sections.length
    ) {
      throw new Error("V3 design-plan section count mismatch");
    }
    const sections = rawRoute.sections.map((rawSection, sectionIndex) => {
      if (!isRecord(rawSection)) {
        throw new Error("invalid V3 design-plan section");
      }
      assertExactKeys(
        rawSection,
        ["id", "treatment", "surface", "density"],
        "V3 section",
      );
      const blueprintSection = blueprintRoute.sections[sectionIndex];
      if (
        !blueprintSection ||
        rawSection.id !== blueprintSection.id ||
        typeof rawSection.treatment !== "string" ||
        !kit.allowedSectionTreatments.includes(rawSection.treatment) ||
        typeof rawSection.surface !== "string" ||
        !isSurface(rawSection.surface) ||
        typeof rawSection.density !== "string" ||
        !isDensity(rawSection.density)
      ) {
        throw new Error("V3 design-plan section mismatch");
      }
      return {
        id: rawSection.id,
        treatment: rawSection.treatment,
        surface: rawSection.surface,
        density: rawSection.density,
      };
    });
    for (
      let sectionIndex = 2;
      sectionIndex < sections.length;
      sectionIndex += 1
    ) {
      const previous = sections[sectionIndex - 1];
      const beforePrevious = sections[sectionIndex - 2];
      const current = sections[sectionIndex];
      if (
        previous &&
        beforePrevious &&
        current &&
        `${beforePrevious.treatment}:${beforePrevious.surface}` ===
          `${previous.treatment}:${previous.surface}` &&
        `${previous.treatment}:${previous.surface}` ===
          `${current.treatment}:${current.surface}`
      ) {
        throw new Error(
          "V3 design-plan has more than two consecutive equal treatments",
        );
      }
    }
    return { path: rawRoute.path, patternId: rawRoute.patternId, sections };
  });
}

function parseMobileTransforms(
  value: unknown,
  routes: WriterDesignPlanV3["routes"],
  blueprint: ProfessionalSiteBlueprintV1,
  kit: GeneratedSiteDesignKitV2,
): WriterDesignPlanV3["mobileTransforms"] {
  if (!Array.isArray(value)) {
    throw new Error("invalid V3 mobile transforms");
  }
  const transforms = value.map((rawTransform) => {
    if (!isRecord(rawTransform)) {
      throw new Error("invalid V3 mobile transform");
    }
    assertExactKeys(
      rawTransform,
      ["route", "pattern", "transform"],
      "V3 mobile transform",
    );
    if (
      typeof rawTransform.route !== "string" ||
      typeof rawTransform.pattern !== "string" ||
      typeof rawTransform.transform !== "string" ||
      rawTransform.transform.trim().length === 0
    ) {
      throw new Error("invalid V3 mobile transform");
    }
    const route = routes.find(
      (candidate) => candidate.path === rawTransform.route,
    );
    if (!route || route.patternId !== rawTransform.pattern) {
      throw new Error("V3 mobile transform does not match route pattern");
    }
    return {
      route: rawTransform.route,
      pattern: rawTransform.pattern,
      transform: rawTransform.transform,
    };
  });
  const seen = new Set<string>();
  for (const transform of transforms) {
    const key = `${transform.route}:${transform.pattern}`;
    if (seen.has(key)) {
      throw new Error("V3 design-plan has duplicate mobile transform");
    }
    seen.add(key);
  }
  for (const route of routes) {
    const pattern = kit.compositionPatterns.find(
      (candidate) => candidate.id === route.patternId,
    );
    if (
      pattern &&
      ["split", "asymmetric", "rail"].includes(pattern.desktopRelationship) &&
      !transforms.some(
        (transform) =>
          transform.route === route.path &&
          transform.pattern === route.patternId,
      )
    ) {
      throw new Error(
        `V3 design-plan is missing mobile transform for ${route.path}`,
      );
    }
  }
  for (const transform of transforms) {
    if (!blueprint.routes.some((route) => route.path === transform.route)) {
      throw new Error("V3 design-plan mobile transform has unknown route");
    }
  }
  return transforms;
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error(`invalid ${label} fields`);
  }
  for (const key of keys) {
    if (!(key in value)) {
      throw new Error(`missing ${label} field ${key}`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFontStackId(value: string): value is ProfessionalFontStackId {
  return FONT_STACKS.includes(value as (typeof FONT_STACKS)[number]);
}

function isSignatureAnchor(
  value: string,
): value is WriterDesignPlanV3["signature"]["sourceAnchor"] {
  return SIGNATURE_ANCHORS.includes(
    value as (typeof SIGNATURE_ANCHORS)[number],
  );
}

function isSurface(
  value: string,
): value is WriterDesignPlanV3["routes"][number]["sections"][number]["surface"] {
  return SURFACES.includes(value as (typeof SURFACES)[number]);
}

function isDensity(
  value: string,
): value is WriterDesignPlanV3["routes"][number]["sections"][number]["density"] {
  return DENSITIES.includes(value as (typeof DENSITIES)[number]);
}
