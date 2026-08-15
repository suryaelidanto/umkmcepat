import { describe, expect, it } from "vitest";

import { createBatchedResponseParser } from "./batched-response";
import {
  PROFESSIONAL_DESIGN_KITS,
  type GeneratedSiteDesignKitV2,
} from "./professional-site-kits";
import {
  parseWriterDesignPlanV3,
  type WriterDesignPlanV3,
} from "./professional-site-plan";

import type { ProfessionalSiteBlueprintV1 } from "./professional-site-blueprint";

const kit = PROFESSIONAL_DESIGN_KITS.get(
  "catalog-story",
) as GeneratedSiteDesignKitV2;

const blueprint: ProfessionalSiteBlueprintV1 = {
  schemaVersion: 1,
  blueprintHash: "a".repeat(64),
  contractHash: "b".repeat(64),
  kit: {
    id: "catalog-story",
    version: 2,
    allowedPatternIds: ["asymmetric-catalog-hero"],
  },
  pageStrategy: {
    mode: "single",
    reason: "single-primary-job",
    routeCount: 1,
  },
  contentDepth: {
    density: "regular",
    suppliedFactCount: 3,
    omissionPolicy: "omit-unsupported-sections",
  },
  firstView: { requiredRoles: ["identity", "offer", "primary-action"] },
  signatureRoute: "/",
  artDirection: {
    subject: "Kopi Senja",
    audience: "Pekerja sore",
    acceptedDirection: "hangat",
    variance: 6,
    motion: 2,
    density: 6,
    shape: "soft",
    typography: {
      allowedDisplayStackIds: ["editorial-serif", "geometric-sans"],
      bodyStackId: "humanist-sans",
      maxDisplayRem: 5.75,
      maxBodyCh: 68,
    },
    palette: {
      backgroundLightness: "light",
      temperature: "warm",
      accentSurfaceMaximum: 0.1,
    },
    rhythm: {
      sectionSpacingRem: [4, 8],
      allowAlternatingSurfaces: true,
      maximumConsecutiveEqualTreatments: 2,
    },
    signature: {
      budget: 1,
      mustReference: ["product"],
      forbidden: ["reference identity leakage"],
    },
  },
  media: { mode: "graphic", approvedAssets: [] },
  routes: [
    {
      path: "/",
      filePath: "src/routes/index.tsx",
      exportName: "HomeRouteComponent",
      purpose: "Beranda",
      primaryJob: "Memilih kopi",
      requiredFactIds: ["offer-1", "contact-1"],
      requiredContentPaths: [
        "site.businessName",
        "site.offers",
        "site.primaryCta",
      ],
      firstView: {
        identityText: "Kedai Senja",
        offerTexts: ["Kopi Senja"],
        primaryCtaLabel: "Pesan lewat WhatsApp",
        primaryCtaHref: "https://wa.me/628123456789",
      },
      allowedPatternIds: ["asymmetric-catalog-hero"],
      sections: [
        {
          id: "hero",
          purpose: "Identity and offer",
          role: "identity",
          requiredFactIds: ["offer-1", "contact-1"],
          requiredContentPaths: [
            "site.businessName",
            "site.offers",
            "site.primaryCta",
          ],
          requiredVisibleTexts: [
            "Kedai Senja",
            "Kopi Senja",
            "Pesan lewat WhatsApp",
          ],
        },
        {
          id: "catalog",
          purpose: "Catalog",
          role: "catalog",
          requiredFactIds: ["offer-1"],
          requiredContentPaths: ["site.offers"],
          requiredVisibleTexts: ["Kopi Senja"],
        },
      ],
    },
  ],
  responsive: {
    mobileViewport: { width: 390, height: 844 },
    desktopViewport: { width: 1440, height: 1000 },
    requireExplicitTransformFor: ["asymmetric-catalog-hero"],
    primaryActionVisibleOnMobile: true,
  },
};

const validPlan: WriterDesignPlanV3 = {
  schemaVersion: 3,
  blueprintHash: blueprint.blueprintHash,
  visualThesis:
    "The supplied product choice leads the page while one quiet craft detail carries identity.",
  signature: {
    route: "/",
    description: "A measured coffee-fold graphic frames the catalog preview.",
    sourceAnchor: "product",
  },
  typography: {
    displayStackId: "editorial-serif",
    bodyStackId: "humanist-sans",
  },
  palette: {
    background: "#f7f3ec",
    foreground: "#3d2b1f",
    muted: "#e5ddd2",
    accent: "#a34f2d",
  },
  routes: [
    {
      path: "/",
      patternId: "asymmetric-catalog-hero",
      sections: [
        {
          id: "hero",
          treatment: "split-feature",
          surface: "base",
          density: "airy",
        },
        {
          id: "catalog",
          treatment: "editorial-list",
          surface: "muted",
          density: "regular",
        },
      ],
    },
  ],
  mobileTransforms: [
    {
      route: "/",
      pattern: "asymmetric-catalog-hero",
      transform:
        "Place the promise and primary action before the compact catalog preview.",
    },
  ],
};

function clonePlan(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(validPlan)) as Record<string, unknown>;
}

function parse(value: unknown): WriterDesignPlanV3 {
  return parseWriterDesignPlanV3({ value, blueprint, kit });
}

describe("WriterDesignPlanV3", () => {
  it("accepts a complete plan with route-specific pattern and mobile transform", () => {
    expect(parse(validPlan)).toEqual(validPlan);
  });

  it.each([
    ["large plan", () => ({ ...clonePlan(), visualThesis: "x".repeat(7_000) })],
    [
      "wrong blueprint hash",
      () => ({ ...clonePlan(), blueprintHash: "c".repeat(64) }),
    ],
    [
      "invalid palette literal",
      () => ({
        ...clonePlan(),
        palette: { ...validPlan.palette, accent: "red" },
      }),
    ],
    [
      "missing signature route",
      () => ({
        ...clonePlan(),
        signature: { ...validPlan.signature, route: "/missing" },
      }),
    ],
    [
      "invalid signature anchor",
      () => ({
        ...clonePlan(),
        signature: { ...validPlan.signature, sourceAnchor: "audience" },
      }),
    ],
    [
      "missing mobile transform",
      () => ({ ...clonePlan(), mobileTransforms: [] }),
    ],
    [
      "empty signature",
      () => ({
        ...clonePlan(),
        signature: { ...validPlan.signature, description: "" },
      }),
    ],
  ])("rejects %s", (_name, makeValue) => {
    expect(() => parse(makeValue())).toThrow();
  });

  it("rejects a route pattern outside that route binding", () => {
    expect(() =>
      parse({
        ...clonePlan(),
        routes: [{ ...validPlan.routes[0], patternId: "wrong-pattern" }],
      }),
    ).toThrow(/pattern/i);
  });

  it("rejects missing, duplicate, or reordered sections", () => {
    for (const sections of [
      [validPlan.routes[0].sections[0]],
      [...validPlan.routes[0].sections, validPlan.routes[0].sections[0]],
      [...validPlan.routes[0].sections].reverse(),
    ]) {
      expect(() =>
        parse({
          ...clonePlan(),
          routes: [{ ...validPlan.routes[0], sections }],
        }),
      ).toThrow(/section/i);
    }
  });

  it("rejects three consecutive equal treatment and surface pairs", () => {
    const extendedBlueprint: ProfessionalSiteBlueprintV1 = {
      ...blueprint,
      routes: [
        {
          ...blueprint.routes[0],
          sections: [
            ...blueprint.routes[0].sections,
            {
              id: "extra",
              purpose: "Extra",
              role: "story",
              requiredFactIds: [],
              requiredContentPaths: [],
              requiredVisibleTexts: [],
            },
          ],
        },
      ],
    };
    expect(() =>
      parseWriterDesignPlanV3({
        value: {
          ...clonePlan(),
          routes: [
            {
              ...validPlan.routes[0],
              sections: [
                {
                  id: "hero",
                  treatment: "editorial-list",
                  surface: "base",
                  density: "regular",
                },
                {
                  id: "catalog",
                  treatment: "editorial-list",
                  surface: "base",
                  density: "regular",
                },
                {
                  id: "extra",
                  treatment: "editorial-list",
                  surface: "base",
                  density: "regular",
                },
              ],
            },
          ],
        },
        blueprint: extendedBlueprint,
        kit,
      }),
    ).toThrow(/consecutive/i);
  });

  it("rejects typography stacks outside kit policy and unknown keys", () => {
    expect(() =>
      parse({
        ...clonePlan(),
        typography: {
          displayStackId: "restrained-grotesk",
          bodyStackId: "humanist-sans",
        },
      }),
    ).toThrow(/typography/i);
    expect(() => parse({ ...clonePlan(), extra: true })).toThrow(/fields/i);
  });
});

describe("V3 response parser required paths", () => {
  const planJson = JSON.stringify(validPlan);
  const options = () => ({
    requireDesignPlan: true,
    designPlanV3Expected: { blueprint, kit },
    requiredFilePaths: [
      "src/routes/index.tsx",
      "src/routes/kelas.tsx",
      "src/components/site/generated-shell.tsx",
    ],
    stopAfterRequiredFilePaths: true,
    implicitDoneSummary: "All required route files emitted.",
  });

  it("parses a V3 plan and stops only after every required file closes", () => {
    const parser = createBatchedResponseParser(options());
    parser.push(
      `<design-plan>${planJson}</design-plan><file path="src/routes/kelas.tsx">kelas</file><file path="src/routes/index.tsx">home</file><file path="src/components/site/generated-shell.tsx">shell</file><file path="src/routes/ignored.tsx">ignored</file>`,
    );
    expect(parser.stoppedAfterFilePath).toBe(false);
    expect(parser.stoppedAfterRequiredFilePaths).toBe(true);
    const result = parser.finalize();
    expect(result.designPlanV3?.schemaVersion).toBe(3);
    expect(result.stoppedAfterRequiredFilePaths).toBe(true);
    expect(result.files.has("src/routes/ignored.tsx")).toBe(false);
  });

  it("retains unexpected writable paths for the source gate", () => {
    const parser = createBatchedResponseParser({
      ...options(),
      requiredFilePaths: ["src/routes/index.tsx"],
    });
    parser.push(
      `<design-plan>${planJson}</design-plan><file path="src/routes/sneaky.tsx">sneaky</file><file path="src/routes/index.tsx">home</file>`,
    );
    expect(parser.finalize().files.has("src/routes/sneaky.tsx")).toBe(true);
  });

  it("fails finalization when a required path never closes", () => {
    const parser = createBatchedResponseParser(options());
    parser.push(
      `<design-plan>${planJson}</design-plan><file path="src/routes/index.tsx">home</file>`,
    );
    expect(() => parser.finalize()).toThrow(/required file/i);
  });
});
