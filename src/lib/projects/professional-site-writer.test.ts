import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildProfessionalSiteCorrectionPrompt,
  buildProfessionalSiteWriterPrompt,
} from "./batched-prompt";
import { GeneratedSiteCallBudget } from "./generated-site-call-budget";
import { PROFESSIONAL_DESIGN_KITS } from "./professional-site-kits";
import {
  runProfessionalSiteCorrection,
  runProfessionalSiteGenerate,
} from "./professional-site-writer";

import type { GeneratedSiteWriterContractV3 } from "./generated-site-contract";
import type { GeneratedProjectFile } from "./generated-types";
import type {
  ProfessionalRouteBinding,
  ProfessionalSiteBlueprintV1,
} from "./professional-site-blueprint";
import type { WriterDesignPlanV3 } from "./professional-site-plan";

const { runOneStreamedResponseMock } = vi.hoisted(() => ({
  runOneStreamedResponseMock: vi.fn(),
}));

vi.mock("@/lib/projects/batched-generator", () => ({
  runOneStreamedResponse: runOneStreamedResponseMock,
}));

const kit = PROFESSIONAL_DESIGN_KITS.get("bold-typographic");
if (!kit) {
  throw new Error("professional test kit missing");
}

function routeBinding(path: "/" | "/kelas"): ProfessionalRouteBinding {
  const isHome = path === "/";
  return {
    path,
    filePath: isHome ? "src/routes/index.tsx" : "src/routes/kelas.tsx",
    exportName: isHome ? "HomeRouteComponent" : "KelasRouteComponent",
    purpose: isHome ? "Beranda" : "Kelas",
    primaryJob: "Memilih penawaran",
    requiredFactIds: [],
    requiredContentPaths: [
      "site.businessName",
      "site.heroTitle",
      "site.primaryCta",
    ],
    firstView: {
      identityText: "Kedai Senja",
      offerTexts: ["Kopi Senja"],
      primaryCtaLabel: "Pesan lewat WhatsApp",
      primaryCtaHref: "https://wa.me/628123456789",
    },
    allowedPatternIds: ["full-field-lockup"],
    sections: [
      {
        id: isHome ? "hero" : "kelas",
        purpose: isHome ? "Identity and offer" : "Class offer",
        role: "identity",
        requiredFactIds: [],
        requiredContentPaths: ["site.heroTitle"],
        requiredVisibleTexts: ["Kopi Senja"],
      },
    ],
  };
}

function makeBlueprint(
  paths: ("/" | "/kelas")[] = ["/"],
): ProfessionalSiteBlueprintV1 {
  const routes = paths.map(routeBinding);
  return {
    schemaVersion: 1,
    blueprintHash: "a".repeat(64),
    contractHash: "b".repeat(64),
    kit: {
      id: "bold-typographic",
      version: 2,
      allowedPatternIds: ["full-field-lockup"],
    },
    pageStrategy: {
      mode: paths.length === 1 ? "single" : "multi",
      reason:
        paths.length === 1 ? "single-primary-job" : "distinct-customer-jobs",
      routeCount: paths.length,
    },
    contentDepth: {
      density: "sparse",
      suppliedFactCount: 1,
      omissionPolicy: "omit-unsupported-sections",
    },
    firstView: { requiredRoles: ["identity", "offer", "primary-action"] },
    signatureRoute: "/",
    artDirection: {
      subject: "Kopi Senja",
      audience: "Pekerja sore",
      acceptedDirection: "hangat",
      variance: 7,
      motion: 2,
      density: 3,
      shape: "sharp",
      typography: {
        allowedDisplayStackIds: ["restrained-grotesk"],
        bodyStackId: "restrained-grotesk",
        maxDisplayRem: 5.25,
        maxBodyCh: 64,
      },
      palette: {
        backgroundLightness: "dark",
        temperature: "cool",
        accentSurfaceMaximum: 0.1,
      },
      rhythm: {
        sectionSpacingRem: [3, 6],
        allowAlternatingSurfaces: false,
        maximumConsecutiveEqualTreatments: 2,
      },
      signature: {
        budget: 1,
        mustReference: ["offer"],
        forbidden: ["unsupported claim"],
      },
    },
    media: { mode: "graphic", approvedAssets: [] },
    routes,
    responsive: {
      mobileViewport: { width: 390, height: 844 },
      desktopViewport: { width: 1440, height: 1000 },
      requireExplicitTransformFor: [],
      primaryActionVisibleOnMobile: true,
    },
  };
}

function makeContract(
  paths: ("/" | "/kelas")[] = ["/"],
): GeneratedSiteWriterContractV3 {
  return {
    schemaVersion: 3,
    contractHash: "b".repeat(64),
    handoff: { contractHash: "c".repeat(64), planHash: "d".repeat(64) },
    business: {
      name: "Kedai Senja",
      type: "fnb",
      audience: "Pekerja sore",
      primaryJob: "Memilih penawaran",
    },
    content: {
      businessName: "Kedai Senja",
      businessType: "fnb",
      audience: "Pekerja sore",
      ownerTagline: "Kopi untuk jeda sore",
      heroTitle: "Kopi untuk jeda sore",
      offers: [{ name: "Kopi Senja", description: "Kopi seduh manual" }],
      usp: [],
      testimonials: [],
      certifications: [],
      hours: [],
      paymentMethods: [],
      priceRange: null,
      address: null,
      deliveryArea: null,
      socialLinks: [],
      promotion: null,
      primaryCta: {
        intentId: "cta-wa",
        kind: "whatsapp",
        label: "Pesan lewat WhatsApp",
        targetFactId: "contact-1",
        href: "https://wa.me/628123456789",
      },
      secondaryCta: null,
      navigation: [],
      labels: {
        catalog: "Pilihan",
        proof: "Yang perlu diketahui",
        process: "Cara memesan",
        operations: "Informasi usaha",
        contact: "Hubungi",
      },
      otherFacts: [],
    },
    factIndex: [{ id: "contact-1", kind: "contact" }],
    obligations: {
      routes: paths.map((path) => ({
        path,
        purpose: path === "/" ? "Beranda" : "Kelas",
        requiredFactIds: [],
        requiredSectionIds: [path === "/" ? "hero" : "kelas"],
      })),
      sections: paths.map((path) => ({
        id: path === "/" ? "hero" : "kelas",
        purpose: path === "/" ? "Identity and offer" : "Class offer",
        requiredFactIds: [],
      })),
      prohibitedClaims: [],
    },
    media: { mode: "graphic", approvedAssets: [] },
    visualInputs: {
      direction: "hangat",
      density: "sparse",
      selectedKitId: "bold-typographic",
      selectedKitVersion: 2,
    },
  };
}

function makePlan(blueprint: ProfessionalSiteBlueprintV1): WriterDesignPlanV3 {
  return {
    schemaVersion: 3,
    blueprintHash: blueprint.blueprintHash,
    visualThesis: "One bold offer carries a quiet, useful first view.",
    signature: {
      route: "/",
      description: "The accepted offer becomes the signature line.",
      sourceAnchor: "offer",
    },
    typography: {
      displayStackId: "restrained-grotesk",
      bodyStackId: "restrained-grotesk",
    },
    palette: {
      background: "#171b2b",
      foreground: "#f3f4ff",
      muted: "#2c3150",
      accent: "#9d7cff",
    },
    routes: blueprint.routes.map((route) => ({
      path: route.path,
      patternId: "full-field-lockup",
      sections: route.sections.map((section) => ({
        id: section.id,
        treatment: "full-field-lockup",
        surface: "base",
        density: "regular",
      })),
    })),
    mobileTransforms: [],
  };
}

function streamResult(
  blueprint: ProfessionalSiteBlueprintV1,
  files: GeneratedProjectFile[],
) {
  return {
    modelRequested: "default-combo",
    modelServed: "served-combo",
    finishedText: true,
    requestMs: 10,
    firstFileClosedMs: 4,
    response: {
      designPlan: null,
      designPlanV2: null,
      designPlanV3: makePlan(blueprint),
      diagnostics: [],
      doneSummary: "Situs selesai.",
      files: new Map(files.map((file) => [file.path, file])),
      proposals: [],
    },
  };
}

const routeFile = (path: string): GeneratedProjectFile => {
  const isHome = path === "src/routes/index.tsx";
  const sectionId = isHome ? "hero" : "kelas";
  return {
    path,
    content: `import { site } from "@/content/site";
import { usePreviewReady } from "@/lib/preview-ready";
export function ${isHome ? "HomeRouteComponent" : "KelasRouteComponent"}() {
  usePreviewReady();
  return <main data-pattern="full-field-lockup" className="font-body">
    <section data-first-view className="font-display"><h1>{site.heroTitle}</h1><p>{site.businessName}</p><p>{site.audience}</p><p>{site.offers.map((offer) => <span key={offer.name}>{offer.name}</span>)}</p><a data-primary-action className="inline-flex min-h-11" href={site.primaryCta.href} target="_blank" rel="noopener noreferrer">{site.primaryCta.label}</a></section>
    <section data-section-id="${sectionId}"><p>{site.heroTitle}</p></section>
    ${isHome ? "<aside data-signature>{site.offers.map((offer) => <span key={offer.name}>{offer.name}</span>)}</aside>" : ""}
  </main>;
}`,
  };
};

describe("professional site prompts", () => {
  it("includes the immutable V3 contract, blueprint, hooks, actions, and safety rules", () => {
    const contract = makeContract();
    const blueprint = makeBlueprint();
    const prompt = buildProfessionalSiteWriterPrompt({
      contract,
      blueprint,
      kit,
    });
    expect(prompt.system).toContain("data-first-view");
    expect(prompt.system).toContain("data-primary-action");
    expect(prompt.system).toContain("data-signature");
    expect(prompt.system).toContain("site.primaryCta.href");
    expect(prompt.system).toContain("no model tools");
    expect(prompt.system).toContain("maxRetries: 0");
    expect(prompt.system).toContain("Indonesian");
    expect(prompt.user).toContain(contract.contractHash);
    expect(prompt.user).toContain(blueprint.blueprintHash);
    expect(prompt.user).toContain("full-field-lockup");
  });

  it("limits correction output to implicated complete paths and the accepted plan", () => {
    const contract = makeContract();
    const blueprint = makeBlueprint();
    const plan = makePlan(blueprint);
    const prompt = buildProfessionalSiteCorrectionPrompt({
      contract,
      blueprint,
      kit,
      acceptedPlan: plan,
      reason: "source_gate",
      diagnostics: ["src/routes/index.tsx: missing data-primary-action"],
      implicatedPaths: ["src/routes/index.tsx"],
      files: [routeFile("src/routes/index.tsx")],
    });
    expect(prompt.system).toContain("only shared pre-review correction");
    expect(prompt.system).toContain("<design-plan>");
    expect(prompt.user).toContain("src/routes/index.tsx");
    expect(prompt.user).toContain("missing data-primary-action");
    expect(prompt.user).not.toContain("src/router.tsx");
  });
});

describe("runProfessionalSiteGenerate", () => {
  beforeEach(() => {
    runOneStreamedResponseMock.mockReset();
  });

  it("uses one writer call and compiles protected content, theme, and router", async () => {
    const contract = makeContract();
    const blueprint = makeBlueprint();
    runOneStreamedResponseMock.mockResolvedValueOnce(
      streamResult(blueprint, [routeFile("src/routes/index.tsx")]),
    );
    const result = await runProfessionalSiteGenerate({
      contract,
      blueprint,
      kit,
      projectId: "project-1",
      userId: "user-1",
      attemptId: "attempt-1",
      buildId: "build-1",
      budget: new GeneratedSiteCallBudget(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(runOneStreamedResponseMock).toHaveBeenCalledTimes(1);
    expect(runOneStreamedResponseMock.mock.calls[0]?.[0]).toMatchObject({
      designPlanV3Expected: { blueprint, kit },
      requiredFilePaths: ["src/routes/index.tsx"],
      stopAfterRequiredFilePaths: true,
      maxRetries: 0,
      requireDesignPlan: true,
    });
    expect(
      result.files.find((file) => file.path === "src/content/site.ts")?.content,
    ).toContain("Kedai Senja");
    expect(
      result.files.find((file) => file.path === "src/router.tsx")?.content,
    ).toContain("createHashHistory()");
    expect(
      result.files.find((file) => file.path === "src/index.css")?.content,
    ).toContain("--site-font-body");
    expect(
      result.files.find((file) => file.path === "src/router.tsx")?.content,
    ).not.toContain("generated-shell");
  });

  it("requires every route and the shared shell for multi-route output", async () => {
    const contract = makeContract(["/", "/kelas"]);
    const blueprint = makeBlueprint(["/", "/kelas"]);
    runOneStreamedResponseMock.mockResolvedValueOnce(
      streamResult(blueprint, [
        routeFile("src/routes/index.tsx"),
        routeFile("src/routes/kelas.tsx"),
        {
          path: "src/components/site/generated-shell.tsx",
          content: "export function GeneratedShell() { return null; }",
        },
      ]),
    );
    const result = await runProfessionalSiteGenerate({
      contract,
      blueprint,
      kit,
      projectId: "project-1",
      userId: "user-1",
      attemptId: "attempt-1",
      buildId: null,
      budget: new GeneratedSiteCallBudget(),
    });
    expect(result.ok).toBe(true);
    expect(
      runOneStreamedResponseMock.mock.calls[0]?.[0]?.requiredFilePaths,
    ).toEqual([
      "src/routes/index.tsx",
      "src/routes/kelas.tsx",
      "src/components/site/generated-shell.tsx",
    ]);
    expect(result.ok && result.writtenPaths).toContain(
      "src/components/site/generated-shell.tsx",
    );
  });

  it("runs the same source gate after the bounded correction", async () => {
    const contract = makeContract();
    const blueprint = makeBlueprint();
    const acceptedPlan = makePlan(blueprint);
    const budget = new GeneratedSiteCallBudget();
    runOneStreamedResponseMock.mockResolvedValueOnce(
      streamResult(blueprint, [routeFile("src/routes/index.tsx")]),
    );
    const result = await runProfessionalSiteCorrection({
      contract,
      blueprint,
      kit,
      acceptedPlan,
      reason: "source_gate",
      diagnostics: ["primary action hook"],
      implicatedPaths: ["src/routes/index.tsx"],
      files: [routeFile("src/routes/index.tsx")],
      projectId: "project-1",
      attemptId: "attempt-1",
      buildId: null,
      budget,
    });
    expect(result.ok).toBe(true);
    expect(budget.snapshot().correctionCalls).toBe(1);
    expect(runOneStreamedResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "repair",
        maxRetries: 0,
        requiredFilePaths: ["src/routes/index.tsx"],
      }),
    );
    expect(result.ok && result.sourceReport.status).toBe("pass");
  });

  it("returns a categorized source-gate report instead of accepting an unsafe route", async () => {
    const contract = makeContract();
    const blueprint = makeBlueprint();
    const unsafeRoute = routeFile("src/routes/index.tsx");
    unsafeRoute.content = unsafeRoute.content.replace(
      "data-primary-action",
      "data-secondary-action",
    );
    runOneStreamedResponseMock.mockResolvedValueOnce(
      streamResult(blueprint, [unsafeRoute]),
    );
    const result = await runProfessionalSiteGenerate({
      contract,
      blueprint,
      kit,
      projectId: "project-1",
      userId: "user-1",
      attemptId: "attempt-1",
      buildId: null,
      budget: new GeneratedSiteCallBudget(),
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.sourceReport).toMatchObject({
      status: "fail",
      hardFailureCounts: { action: expect.any(Number) },
    });
  });

  it.each([
    ["missing route", [routeFile("src/routes/index.tsx")]],
    [
      "protected router",
      [
        routeFile("src/routes/index.tsx"),
        { path: "src/router.tsx", content: "bad" },
      ],
    ],
  ])("rejects %s output", async (label, files) => {
    const multiRoute = label === "missing route";
    const contract = makeContract(multiRoute ? ["/", "/kelas"] : ["/"]);
    const blueprint = makeBlueprint(multiRoute ? ["/", "/kelas"] : ["/"]);
    runOneStreamedResponseMock.mockResolvedValueOnce(
      streamResult(blueprint, files),
    );
    const result = await runProfessionalSiteGenerate({
      contract,
      blueprint,
      kit,
      projectId: "project-1",
      userId: "user-1",
      attemptId: "attempt-1",
      buildId: null,
      budget: new GeneratedSiteCallBudget(),
    });
    expect(result.ok).toBe(false);
  });
});
