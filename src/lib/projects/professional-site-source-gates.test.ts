import { describe, expect, it } from "vitest";

import { PROFESSIONAL_DESIGN_KITS } from "./professional-site-kits";
import { inspectProfessionalStaticSiteSource } from "./professional-site-source-gates";

import type { GeneratedSiteWriterContractV3 } from "./generated-site-contract";
import type { GeneratedProjectFile } from "./generated-types";
import type { ProfessionalSiteBlueprintV1 } from "./professional-site-blueprint";
import type { WriterDesignPlanV3 } from "./professional-site-plan";
import type { ThemeContrastCheck } from "./scaffold/shadcn-theme";

const kit = (() => {
  const value = PROFESSIONAL_DESIGN_KITS.get("bold-typographic");
  if (!value) {
    throw new Error("professional source gate test kit missing");
  }
  return value;
})();

function contract(paths: string[] = ["/"]): GeneratedSiteWriterContractV3 {
  return {
    schemaVersion: 3,
    contractHash: "b".repeat(64),
    handoff: { contractHash: "c".repeat(64), planHash: "d".repeat(64) },
    business: {
      name: "Kedai Senja",
      type: "fnb",
      audience: "Pekerja sore",
      primaryJob: "Memilih kopi",
    },
    content: {
      businessName: "Kedai Senja",
      businessType: "fnb",
      audience: null,
      ownerTagline: null,
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
    factIndex: [
      { id: "offer-1", kind: "offer" },
      { id: "contact-1", kind: "contact" },
    ],
    obligations: {
      routes: paths.map((path) => ({
        path,
        purpose: path === "/" ? "Beranda" : "Kelas",
        requiredFactIds: [],
        requiredSectionIds: [path === "/" ? "hero" : "kelas"],
      })),
      sections: paths.map((path) => ({
        id: path === "/" ? "hero" : "kelas",
        purpose: path === "/" ? "Penawaran" : "Kelas",
        requiredFactIds: [],
      })),
      prohibitedClaims: ["termurah"],
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

function blueprint(paths: string[] = ["/"]): ProfessionalSiteBlueprintV1 {
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
      suppliedFactCount: 2,
      omissionPolicy: "omit-unsupported-sections",
    },
    firstView: { requiredRoles: ["identity", "offer", "primary-action"] },
    signatureRoute: "/",
    artDirection: {
      subject: "Kopi untuk jeda sore",
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
        forbidden: ["unsupported"],
      },
    },
    media: { mode: "graphic", approvedAssets: [] },
    routes: paths.map((path) => ({
      path,
      filePath:
        path === "/"
          ? "src/routes/index.tsx"
          : `src/routes/${path.slice(1)}.tsx`,
      exportName: path === "/" ? "HomeRouteComponent" : "KelasRouteComponent",
      purpose: path === "/" ? "Beranda" : "Kelas",
      primaryJob: "Memilih kopi",
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
          id: path === "/" ? "hero" : "kelas",
          purpose: "Penawaran",
          role: "identity",
          requiredFactIds: [],
          requiredContentPaths: ["site.heroTitle"],
          requiredVisibleTexts: [],
        },
      ],
    })),
    responsive: {
      mobileViewport: { width: 390, height: 844 },
      desktopViewport: { width: 1440, height: 1000 },
      requireExplicitTransformFor: [],
      primaryActionVisibleOnMobile: true,
    },
  };
}

function plan(inputBlueprint = blueprint()): WriterDesignPlanV3 {
  return {
    schemaVersion: 3,
    blueprintHash: inputBlueprint.blueprintHash,
    visualThesis: "One accepted offer carries the first view.",
    signature: {
      route: "/",
      description: "The offer is the signature.",
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
    routes: inputBlueprint.routes.map((route) => ({
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

const themeChecks: ThemeContrastCheck[] = [
  {
    role: "foreground",
    foreground: "#f3f4ff",
    background: "#171b2b",
    ratio: 15,
    minimum: 4.5,
    pass: true,
  },
];

function siteFile(): GeneratedProjectFile {
  return {
    path: "src/content/site.ts",
    content: `export const site = ${JSON.stringify(contract().content)} as const;\n`,
  };
}

function cssFile(): GeneratedProjectFile {
  return {
    path: "src/index.css",
    content:
      ":root { --site-font-display: Arial; --site-font-body: Arial; --primary: #000000; }",
  };
}

function routerFile(paths: string[] = ["/"]): GeneratedProjectFile {
  return {
    path: "src/router.tsx",
    content: `import { createHashHistory, createRouter } from \"@tanstack/react-router\";\n${paths
      .map(
        (path) =>
          `const route${path === "/" ? "Home" : "Kelas"} = { path: ${JSON.stringify(path)} };`,
      )
      .join("\n")}\ncreateHashHistory(); createRouter({});`,
  };
}

function validRoute(path = "/", sectionId = "hero"): GeneratedProjectFile {
  const exportName =
    path === "/" ? "HomeRouteComponent" : "KelasRouteComponent";
  return {
    path:
      path === "/" ? "src/routes/index.tsx" : `src/routes/${path.slice(1)}.tsx`,
    content: `import { site } from \"@/content/site\";\nimport { usePreviewReady } from \"@/lib/preview-ready\";\nexport function ${exportName}() {\n  usePreviewReady();\n  return <main data-pattern=\"full-field-lockup\" className=\"font-body\">\n    <section data-first-view className=\"font-display\"><h1>{site.heroTitle}</h1><p>{site.businessName}</p><p>{site.offers.map((offer) => <span key={offer.name}>{offer.name}</span>)}</p><a data-primary-action className=\"inline-flex min-h-11\" href={site.primaryCta.href} target=\"_blank\" rel=\"noopener noreferrer\">{site.primaryCta.label}</a></section>\n    <section data-section-id=\"${sectionId}\"><p>{site.heroTitle}</p></section>\n    <aside data-signature>{site.offers.map((offer) => <span key={offer.name}>{offer.name}</span>)}</aside>\n  </main>;\n}\n`,
  };
}

function baseFiles(paths: string[] = ["/"]): GeneratedProjectFile[] {
  return [
    ...paths.map((path) => validRoute(path, path === "/" ? "hero" : "kelas")),
    siteFile(),
    cssFile(),
    routerFile(paths),
  ];
}

function inspect(
  files: GeneratedProjectFile[],
  options?: { paths?: string[]; starterFiles?: GeneratedProjectFile[] },
) {
  const selectedPaths = options?.paths ?? ["/"];
  const selectedBlueprint = blueprint(selectedPaths);
  return inspectProfessionalStaticSiteSource({
    contract: contract(selectedPaths),
    blueprint: selectedBlueprint,
    kit,
    plan: plan(selectedBlueprint),
    files,
    starterFiles: options?.starterFiles ?? [
      { path: "src/routes/index.tsx", content: "data-generated-site-starter" },
    ],
    themeChecks,
  });
}

describe("professional static-site source gates", () => {
  it("passes a sparse accepted-fact route and never treats sparse as a failure", () => {
    const report = inspect(baseFiles());
    expect(report.status).toBe("pass");
    expect(report.findings).toEqual([]);
  });

  it("rejects missing, extra, and wrongly exported routes", () => {
    const multi = inspect(baseFiles(["/"]), { paths: ["/", "/kelas"] });
    const extra = inspect([...baseFiles(), validRoute("/lain")]);
    const wrongExport = inspect([
      {
        ...validRoute(),
        content: validRoute().content.replace(
          "HomeRouteComponent",
          "WrongRouteComponent",
        ),
      },
      siteFile(),
      cssFile(),
      routerFile(),
    ]);
    expect(multi.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["missing-route-file"]),
    );
    expect(extra.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["unexpected-route-file"]),
    );
    expect(wrongExport.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["route-export-missing"]),
    );
  });

  it("rejects hook duplication, hidden hooks, and shell-owned hooks", () => {
    const route = validRoute();
    const duplicate = {
      ...route,
      content: route.content.replace(
        "data-signature",
        "data-signature data-signature",
      ),
    };
    const hidden = {
      ...route,
      content: route.content.replace(
        "data-first-view",
        'data-first-view aria-hidden="true"',
      ),
    };
    const shell = {
      path: "src/components/site/generated-shell.tsx",
      content:
        "export function GeneratedShell(){ return <div data-first-view data-primary-action data-signature />; }",
    };
    expect(
      inspect([duplicate, siteFile(), cssFile(), routerFile()]).findings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "signature-hook-count" }),
      ]),
    );
    expect(
      inspect([hidden, siteFile(), cssFile(), routerFile()]).findings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "first-view-hook-invalid" }),
      ]),
    );
    expect(inspect([...baseFiles(), shell]).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "shell-hook-forbidden" }),
      ]),
    );
  });

  it("rejects unknown and unbound accepted data, claims, and customer literals", () => {
    const route = validRoute();
    const content = route.content
      .replace("{site.heroTitle}", "{site.notARealField}")
      .replace("{site.businessName}", "Mau paling murah")
      .replace("{site.offers.map", '{[{ name: "Paket rahasia" }].map')
      .replace(
        'data-pattern="full-field-lockup"',
        'data-pattern="full-field-lockup">Harga termurah<main',
      );
    const report = inspect([
      { ...route, content },
      siteFile(),
      cssFile(),
      routerFile(),
    ]);
    expect(report.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "unknown-site-field",
        "hard-coded-customer-copy",
        "prohibited-claim",
      ]),
    );
  });

  it("rejects unsafe CTA targets and unregistered anchors", () => {
    const route = validRoute();
    const content = route.content
      .replace("href={site.primaryCta.href}", 'href="https://wa.me/629999"')
      .replace('rel="noopener noreferrer"', "")
      .replace("data-signature", 'href="#missing-anchor" data-signature');
    const report = inspect([
      { ...route, content },
      siteFile(),
      cssFile(),
      routerFile(),
    ]);
    expect(report.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "primary-cta-target",
        "external-rel",
        "unregistered-anchor",
      ]),
    );
  });

  it("rejects raw palette, arbitrary fonts, media placeholders, and taste residue", () => {
    const route = validRoute();
    const content = `${route.content.replace('className="font-body"', 'className="font-body bg-white font-[Comic_Sans_MS] h-screen bg-gradient-to-r text-transparent border-l-2"')}\n<img src="https://example.com/photo.jpg" alt="Foto" />\n<span aria-hidden="true" className="h-40 w-40 border bg-accent" />`;
    const report = inspect([
      { ...route, content },
      siteFile(),
      cssFile(),
      routerFile(),
    ]);
    expect(report.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "raw-palette",
        "font-policy",
        "media-invalid",
        "viewport-stability",
      ]),
    );
  });

  it("rejects failed contrast, omitted font roles, browser assertions, and byte overflow", () => {
    const route = validRoute();
    const report = inspect([
      {
        ...route,
        content:
          route.content
            .replaceAll("font-display", "font-title")
            .replaceAll("font-body", "font-copy") + "x".repeat(33_000),
      },
      siteFile(),
      cssFile(),
      routerFile(),
    ]);
    const withContrast = inspect([route, siteFile(), cssFile(), routerFile()]);
    const contrastReport = inspectProfessionalStaticSiteSource({
      contract: contract(),
      blueprint: blueprint(),
      kit,
      plan: plan(),
      files: baseFiles(),
      starterFiles: [{ path: "src/routes/index.tsx", content: "starter" }],
      themeChecks: [{ ...themeChecks[0]!, pass: false }],
    });
    expect(report.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["font-role-missing", "byte-budget"]),
    );
    expect(withContrast.status).toBe("pass");
    expect(contrastReport.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["theme-contrast"]),
    );
  });

  it("returns bounded professional signals without failing valid repetition evidence", () => {
    const selectedBlueprint = blueprint(["/"]);
    const repeated = validRoute().content.replace(
      '<section data-section-id="hero">',
      '<section data-section-id="hero" className="py-12"><article className="rounded-xl border">{site.heroTitle}</article><article className="rounded-xl border">{site.heroTitle}</article><article className="rounded-xl border">{site.heroTitle}</article>',
    );
    const report = inspectProfessionalStaticSiteSource({
      contract: contract(),
      blueprint: selectedBlueprint,
      kit,
      plan: plan(selectedBlueprint),
      files: [
        { ...validRoute(), content: repeated },
        siteFile(),
        cssFile(),
        routerFile(),
      ],
      starterFiles: [{ path: "src/routes/index.tsx", content: "starter" }],
      themeChecks,
    });
    expect(report.status).toBe("pass");
    expect(report.professionalSignals.length).toBeGreaterThan(0);
    expect(report.professionalSignals.length).toBeLessThanOrEqual(20);
    expect(report.professionalSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "card-repetition" }),
      ]),
    );
  });
});
