import { describe, expect, it } from "vitest";

import {
  inspectGeneratedSiteSource,
  inspectGeneratedSiteTasteSource,
  inspectReferenceCalibratedSiteSource,
  normalizeBatchedSiteAnchors,
  normalizeGeneratedInteractiveTargets,
  normalizeGeneratedSiteContent,
} from "./generated-site-gates";

import type { WriterDesignPlanV1 } from "./batched-response";
import type { GeneratedSiteWriterContractV2 } from "./generated-site-contract";
import type { GeneratedSiteContractV1 } from "./generated-site-contract";
import type { GeneratedSiteDesignKitV1 } from "./generated-site-design-kits/types";
import type { WriterDesignPlanV2 } from "./generated-site-design-plan";
import type { GeneratedProjectFile } from "./generated-types";
import type { ThemeContrastCheck } from "./scaffold/shadcn-theme";

function contract(input?: {
  mediaMode?: GeneratedSiteContractV1["design"]["mediaMode"];
}): GeneratedSiteContractV1 {
  return {
    schemaVersion: 1,
    contractHash: "a".repeat(64),
    business: {
      name: "SuryaPhone",
      type: "retail",
      audience: "Pembeli iPhone bekas",
      primaryJob: "Memilih iPhone",
      primaryCta: {
        kind: "whatsapp",
        label: "Chat WhatsApp",
        target: "https://wa.me/628123456789",
      },
    },
    content: {
      headline: "Pilih iPhone dengan kondisi jelas",
      subheadline: "Bandingkan unit sebelum menghubungi penjual.",
      offer: "iPhone bekas dengan kondisi tercatat",
      promotion: null,
      trustPoints: ["Kondisi tercatat"],
      products: [{ name: "iPhone 13", description: "Battery health tercatat" }],
      testimonials: [],
      faq: [],
      usp: ["Kondisi unit tercatat"],
      hours: [],
      paymentMethods: [{ method: "qris" }],
      priceRange: null,
      address: "Jakarta",
      deliveryArea: "Jabodetabek",
      socialLinks: [
        {
          platform: "instagram",
          handle: "@suryaphone",
          url: "https://instagram.com/suryaphone",
        },
      ],
    },
    page: {
      appKind: "landing",
      archetype: "retail-catalog",
      routes: [{ path: "/", purpose: "Katalog", requiredContent: [] }],
      requiredSections: [
        { id: "catalog", purpose: "Katalog", requiredContent: [] },
        { id: "contact", purpose: "Kontak", requiredContent: [] },
      ],
      prohibitedClaims: [],
    },
    design: {
      recipeId: "retail-catalog",
      recipeVersion: 1,
      composition: "catalog-first",
      hierarchy: ["offer", "catalog", "contact"],
      typographyStrategy: "clear",
      colorStrategy: "dark",
      mediaMode: input?.mediaMode ?? "graphic",
      approvedAssets: [],
      signatureElement: "comparison rail",
      antiPatterns: ["starter-centered-card-stack"],
    },
  };
}

function plan(): WriterDesignPlanV1 {
  return {
    contractHash: "a".repeat(64),
    recipeId: "retail-catalog",
    mediaMode: "graphic",
    visualThesis: "Etalase perangkat presisi",
    hierarchy: ["offer", "catalog", "contact"],
    sectionOrder: ["catalog", "contact"],
    signatureElement: "comparison rail",
  };
}

function report(
  source: string,
  input?: { mediaMode?: GeneratedSiteContractV1["design"]["mediaMode"] },
) {
  const files: GeneratedProjectFile[] = [
    { path: "src/routes/index.tsx", content: source },
  ];
  const themeChecks: ThemeContrastCheck[] = [
    {
      role: "foreground",
      foreground: "#ffffff",
      background: "#000000",
      ratio: 21,
      minimum: 4.5,
      pass: true,
    },
  ];
  return inspectGeneratedSiteSource({
    contract: contract(input),
    designPlan: { ...plan(), mediaMode: input?.mediaMode ?? "graphic" },
    files,
    starterIndexSource: "data-generated-site-starter",
    themeChecks,
  });
}

function v2Contract(): GeneratedSiteWriterContractV2 {
  return {
    schemaVersion: 2,
    contractHash: "a".repeat(64),
    handoff: { contractHash: "b".repeat(64), planHash: "c".repeat(64) },
    business: {
      name: "Sintetis",
      type: "retail",
      audience: "Pembeli",
      primaryJob: "Memilih",
      primaryCta: { kind: "whatsapp", label: "Chat", target: "+6281100000000" },
    },
    content: {
      headline: "Pilih",
      subheadline: "Lihat pilihan.",
      offer: "Produk",
      promotion: null,
      trustPoints: ["Jelas"],
      products: [],
      testimonials: [],
      faq: [],
      usp: [],
      hours: [],
      paymentMethods: [],
      priceRange: null,
      address: null,
      deliveryArea: null,
      socialLinks: [],
    },
    obligations: {
      routes: [
        {
          path: "/",
          purpose: "Beranda",
          requiredFactIds: [],
          requiredSectionIds: ["hero"],
        },
      ],
      sections: [{ id: "hero", purpose: "Penawaran", requiredFactIds: [] }],
      prohibitedClaims: [],
    },
    media: { mode: "graphic", approvedAssets: [] },
    visualInputs: {
      direction: "hangat",
      density: "sparse",
      selectedKitId: "bold-typographic",
      selectedKitVersion: 1,
    },
  };
}

function v2Kit(): GeneratedSiteDesignKitV1 {
  return {
    id: "bold-typographic" as const,
    version: 1 as const,
    referenceLabels: ["07"] as ["07"],
    compatibleArchetypes: ["generic"],
    compatibleMediaModes: ["graphic"],
    compatibleDensities: ["sparse"],
    compositionPatterns: [
      { id: "full-field-lockup", intent: "", requires: [], forbids: [] },
    ],
    typography: {
      displayRole: "sans" as const,
      bodyRole: "sans" as const,
      maxDisplayRem: 5,
      maxBodyCh: 64,
    },
    themePolicy: {
      temperature: "cool" as const,
      backgroundLightness: "dark" as const,
      accentSurfaceMaximum: 0.1,
    },
    taste: {
      variance: 7,
      motion: 2,
      density: 3,
      shape: "sharp" as const,
      typeGuidance: "Use a focused sans display and readable body.",
      signatureBudget: 1 as const,
    },
    rhythm: {
      sectionSpacingRem: [3, 6] as [number, number],
      allowAlternatingSurfaces: false,
    },
    primitiveFileIds: ["site-layout-v1"],
    sourceAssertions: [],
    browserAssertions: [],
    criticRubric: [],
    antiPatterns: [],
  };
}

function _v2Plan(): WriterDesignPlanV2 {
  return {
    schemaVersion: 2,
    contractHash: "a".repeat(64),
    kit: { id: "bold-typographic", version: 1 },
    mediaMode: "graphic",
    pageStrategy: "single",
    taste: v2Kit().taste,
    visualThesis: "Bold clear promise",
    compositionPatternId: "full-field-lockup",
    palette: {
      background: "#171b2b",
      foreground: "#f3f4ff",
      muted: "#2c3150",
      accent: "#9d7cff",
    },
    typography: { displayRole: "sans", bodyRole: "sans" },
    sections: [
      { id: "hero", treatment: "lockup", surface: "base", density: "airy" },
    ],
    sectionOrder: ["hero"],
    mobileStrategy: ["stack"],
    signatureElement: "full-field-lockup",
  };
}

describe("reference-calibrated generated site source gates", () => {
  it.each([
    [
      "uses h-screen",
      '<main className="h-screen">ok</main>',
      "viewport-stability",
    ],
    ["uses an em dash", "<p>Jelas — cepat</p>", "llm-dash-tell"],
    [
      "repeats eyebrow scaffolding",
      '<p className="uppercase tracking-wide">A</p>'.repeat(3),
      "eyebrow-overuse",
    ],
    [
      "uses numbered eyebrow scaffolding",
      "<p>01</p><p>02</p><p>03</p>",
      "numbered-scaffolding",
    ],
    [
      "uses uncompiled color utilities",
      '<div className="bg-white text-white border-white">A</div>',
      "uncompiled-theme-utility",
    ],
    [
      "uses the muted surface token as text",
      '<p className="text-muted">A</p>',
      "uncompiled-theme-utility",
    ],
    // --color-card, --color-background, --color-popover, and --color-secondary
    [
      "uses the card surface token as text",
      '<p className="text-card">A</p>',
      "uncompiled-theme-utility",
    ],
    [
      "uses the background surface token as text",
      '<p className="text-background">A</p>',
      "uncompiled-theme-utility",
    ],
    [
      "uses the popover surface token as text",
      '<p className="text-popover">A</p>',
      "uncompiled-theme-utility",
    ],
    [
      "uses the secondary surface token as text",
      '<p className="text-secondary">A</p>',
      "uncompiled-theme-utility",
    ],
    // --muted-foreground/--card-foreground/--popover-foreground/--foreground
    [
      "uses a light-surface foreground token as text inside a contrast surface section",
      '<SiteSection surface="contrast"><p className="text-muted-foreground">A</p></SiteSection>',
      "uncompiled-theme-utility",
    ],
    [
      "uses a light-surface foreground token as text on its own bg-foreground element",
      '<div className="bg-foreground text-foreground">A</div>',
      "uncompiled-theme-utility",
    ],
    // text-foreground is calibrated for the page's light background, not for
    [
      "uses a light-surface foreground token as text on its own bg-accent element",
      '<a className="bg-accent text-foreground">A</a>',
      "uncompiled-theme-utility",
    ],
    [
      "uses a light-surface foreground token as text on its own bg-primary element",
      '<a className="bg-primary text-muted-foreground">A</a>',
      "uncompiled-theme-utility",
    ],
    [
      "uses a thick colored side stripe",
      '<li className="border-l-2 border-accent">A</li>',
      "side-stripe",
    ],
  ])("rejects taste tell: %s", (_name, source, code) => {
    expect(
      inspectGeneratedSiteTasteSource({ source, sectionCount: 3 }),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
  });

  it("accepts a restrained source taste profile", () => {
    expect(
      inspectGeneratedSiteTasteSource({
        source:
          '<main className="min-h-dvh text-foreground"><p className="text-accent">Pilihan jelas</p></main>',
        sectionCount: 3,
      }),
    ).toEqual([]);
  });

  // Reproduced live: {hour.open}–{hour.close} renders as a compact time
  it("accepts an en dash used as a compact range separator", () => {
    expect(
      inspectGeneratedSiteTasteSource({
        source: "<p>{hour.open}–{hour.close}</p>",
        sectionCount: 3,
      }),
    ).toEqual([]);
  });

  // Reproduced live: a real build's writer correctly emitted text-background
  it("accepts text-background inside a contrast surface section", () => {
    expect(
      inspectGeneratedSiteTasteSource({
        source:
          '<SiteSection surface="contrast"><p className="text-background/75">A</p></SiteSection>',
        sectionCount: 3,
      }),
    ).toEqual([]);
  });

  it("still rejects text-background outside a contrast surface section", () => {
    expect(
      inspectGeneratedSiteTasteSource({
        source:
          '<SiteSection surface="contrast"><p>A</p></SiteSection><p className="text-background">B</p>',
        sectionCount: 3,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "uncompiled-theme-utility" }),
      ]),
    );
  });

  // Reproduced live: a bg-foreground illustration div sat near the top of a
  it("still flags text-background far outside a bg-foreground element's own tag", () => {
    const source =
      '<SiteSection surface="base"><div className="flex bg-foreground p-8"><svg /></div><p className="text-background">Elsewhere</p></SiteSection>';
    expect(
      inspectGeneratedSiteTasteSource({ source, sectionCount: 3 }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "uncompiled-theme-utility" }),
      ]),
    );
    const [file] = normalizeBatchedSiteAnchors([
      { path: "src/routes/index.tsx", content: source },
    ]);
    expect(file?.content).toContain(
      '<p className="text-foreground">Elsewhere</p>',
    );
  });

  // Reproduced live: a real build's contact block correctly paired
  it("still flags text-foreground inside a bg-foreground element's descendants", () => {
    const source =
      '<div className="mt-20 bg-foreground p-6 text-background"><h2 className="text-foreground">Pesan atau datang langsung.</h2></div>';
    expect(
      inspectGeneratedSiteTasteSource({ source, sectionCount: 3 }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "uncompiled-theme-utility" }),
      ]),
    );
    const [file] = normalizeBatchedSiteAnchors([
      { path: "src/routes/index.tsx", content: source },
    ]);
    expect(file?.content).toContain(
      '<h2 className="text-background">Pesan atau datang langsung.</h2>',
    );
  });

  it("bounds a bg-foreground element's descendant scan by its own matching close, not a sibling's", () => {
    const source =
      '<div className="bg-foreground p-6 text-background"><p>Inside</p></div><p className="text-foreground">Sibling</p>';
    const [file] = normalizeBatchedSiteAnchors([
      { path: "src/routes/index.tsx", content: source },
    ]);
    expect(file?.content).toContain(
      '<p className="text-foreground">Sibling</p>',
    );
  });

  it("accepts an international WhatsApp URL for a local accepted target", () => {
    const input = v2Contract();
    input.business.primaryCta.target = "08123456789";
    const result = inspectReferenceCalibratedSiteSource({
      contract: input,
      kit: v2Kit(),
      designPlan: _v2Plan(),
      files: [
        {
          path: "src/routes/index.tsx",
          content: `import { site } from "@/content/site"; import { usePreviewReady } from "@/lib/preview-ready"; import { SiteSection } from "@/components/site/layout"; export function HomeRouteComponent() { usePreviewReady(); return <main data-pattern="full-field-lockup"><SiteSection><h1>{site.headline}</h1><p>{site.subheadline}</p><a href="https://wa.me/628123456789">{site.primaryCta}</a></SiteSection></main>; }`,
        },
      ],
      starterIndexSource: "starter",
      themeChecks: [],
    });
    expect(
      result.findings.some(
        (finding) => finding.code === "primary-cta-target-missing",
      ),
    ).toBe(false);
  });

  it("requires the accepted primary action on every contract route", () => {
    const result = inspectReferenceCalibratedSiteSource({
      contract: v2Contract(),
      kit: v2Kit(),
      designPlan: _v2Plan(),
      files: [
        {
          path: "src/routes/index.tsx",
          content: `import { site } from "@/content/site"; import { usePreviewReady } from "@/lib/preview-ready"; import { SiteSection } from "@/components/site/layout"; export function HomeRouteComponent() { usePreviewReady(); return <main data-pattern="full-field-lockup"><SiteSection><h1>{site.headline}</h1><p>{site.subheadline}</p><p>{site.primaryCta}</p></SiteSection></main>; }`,
        },
      ],
      starterIndexSource: "starter",
      themeChecks: [],
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "route-primary-cta-missing" }),
      ]),
    );
  });

  it("rejects a route that references a site.* field the schema does not have", () => {
    // Reproduced live: the writer referenced site.usp when the schema's usp
    const result = inspectReferenceCalibratedSiteSource({
      contract: v2Contract(),
      kit: v2Kit(),
      designPlan: _v2Plan(),
      files: [
        {
          path: "src/content/site.ts",
          // Matches production emission: JSON.stringify always quotes keys.
          content:
            'export const site = {"headline": "Pilih iPhone dengan kondisi jelas", "subheadline": "Bandingkan unit.", "primaryCta": "Chat WhatsApp"} as const;',
        },
        {
          path: "src/routes/index.tsx",
          content: `import { site } from "@/content/site"; import { usePreviewReady } from "@/lib/preview-ready"; import { SiteSection } from "@/components/site/layout"; export function HomeRouteComponent() { usePreviewReady(); return <main data-pattern="full-field-lockup"><SiteSection><h1>{site.headline}</h1><p>{site.subheadline}</p><p>{site.usp[0]}</p><a href="https://wa.me/628123456789">{site.primaryCta}</a></SiteSection></main>; }`,
        },
      ],
      starterIndexSource: "starter",
      themeChecks: [],
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unknown-site-field" }),
      ]),
    );
  });

  it("rejects generated routes that bypass compiled theme tokens", () => {
    const result = inspectReferenceCalibratedSiteSource({
      contract: v2Contract(),
      kit: v2Kit(),
      designPlan: _v2Plan(),
      files: [
        {
          path: "src/routes/index.tsx",
          content: `import { site } from "@/content/site"; import { usePreviewReady } from "@/lib/preview-ready"; import { SiteSection } from "@/components/site/layout"; export function HomeRouteComponent() { usePreviewReady(); return <main data-pattern="full-field-lockup" style={{ color: site.theme.muted }}><SiteSection><h1>{site.headline}</h1><p>{site.subheadline}</p><p>{site.primaryCta}</p></SiteSection></main>; }`,
        },
      ],
      starterIndexSource: "starter",
      themeChecks: [],
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "compiled-theme-bypass" }),
      ]),
    );
  });

  it("rejects empty framed graphics in image-free mode", () => {
    const result = inspectReferenceCalibratedSiteSource({
      contract: v2Contract(),
      kit: v2Kit(),
      designPlan: _v2Plan(),
      files: [
        {
          path: "src/routes/index.tsx",
          content: `import { site } from "@/content/site"; import { usePreviewReady } from "@/lib/preview-ready"; import { SiteSection } from "@/components/site/layout"; export function HomeRouteComponent() { usePreviewReady(); return <main data-pattern="full-field-lockup"><SiteSection><h1>{site.headline}</h1><span aria-hidden="true" className="block h-40 w-32 rounded-lg border border-accent/30 bg-accent/10" /></SiteSection></main>; }`,
        },
      ],
      starterIndexSource: "starter",
      themeChecks: [],
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "empty-graphic-frame" }),
      ]),
    );
  });

  it("rejects fixed-renderer residue and no-photo placeholders", () => {
    const result = inspectReferenceCalibratedSiteSource({
      contract: v2Contract(),
      kit: v2Kit(),
      designPlan: null,
      files: [
        {
          path: "src/routes/index.tsx",
          content:
            '<main data-generated-site-starter><img src="/placeholder.svg" /></main>',
        },
      ],
      starterIndexSource: "<main data-generated-site-starter />",
      themeChecks: [],
    });
    expect(result.status).toBe("fail");
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "missing-design-plan-v2",
        "starter-residue",
        "placeholder-forbidden",
      ]),
    );
  });
});

describe("normalizeGeneratedInteractiveTargets", () => {
  it("upgrades interactive elements in generated component files", () => {
    const [file] = normalizeGeneratedInteractiveTargets([
      {
        path: "src/components/site/SiteFooter.tsx",
        content:
          '<a href="#kontak" className="inline-flex min-h-10 items-center">Chat Admin</a><Button className="h-9">Kirim</Button>',
      },
    ]);

    expect(file?.content).toContain("min-h-11");
    expect(file?.content).toContain("min-w-11");
    expect(file?.content).not.toContain("min-h-10");
  });

  it("keeps computed className props valid while enforcing the target", () => {
    const [file] = normalizeGeneratedInteractiveTargets([
      {
        path: "src/components/site/Actions.tsx",
        content:
          "<a href={link} className={classes}>Chat</a><Button className={classes}>Kirim</Button>",
      },
    ]);

    expect(file?.content.match(/<a[^>]+>/)?.[0]).not.toMatch(
      /className=.*className=/,
    );
    expect(file?.content.match(/<Button[^>]+>/)?.[0]).not.toMatch(
      /className=.*className=/,
    );
    expect(file?.content).toContain('style={{ minHeight: "44px"');
  });

  it("repairs contrast on generated component surfaces and action colors", () => {
    const normalized = normalizeGeneratedSiteContent(
      '<div className="bg-accent p-8"><h3>Masih ragu?</h3></div><a href={link} className="bg-white text-accent">Tanya Admin</a><Button className="bg-[#25D366] text-white">Chat</Button>',
    );

    expect(normalized).toContain("bg-accent p-8 text-foreground");
    expect(normalized).toContain("bg-white text-foreground");
    expect(normalized).toContain("bg-[#25D366] text-foreground");
  });

  it("removes remote font imports from generated CSS", () => {
    const normalized = normalizeGeneratedSiteContent(
      '@import url("https://fonts.googleapis.com/css2?family=Fraunces");\n@import "tailwindcss";',
    );

    expect(normalized).not.toContain("fonts.googleapis.com");
    expect(normalized).toContain('@import "tailwindcss";');
  });

  it("only adds touch target classes to opening anchor and button tags, not child icons or nested elements", () => {
    const normalized = normalizeGeneratedSiteContent(
      '<Button asChild size="lg"><a href="https://wa.me/628123"><MessageCircle className="size-4 text-primary" />Pilih Paket</a></Button>',
    );

    expect(normalized).toContain('className="size-4 text-primary"');
    expect(normalized).not.toContain(
      'className="inline-flex min-h-11 min-w-11 items-center justify-center size-4 text-primary"',
    );
  });

  it("never creates duplicate className attributes on multiline or property-rich anchor tags", () => {
    const input = `<nav className="flex flex-col gap-1 p-4" aria-label="Navigasi mobile">
      {navLinks.map((link) => (
        <a
          key={link.href}
          href={link.href}
          onClick={() => setOpen(false)}
          className="inline-flex min-h-11 min-w-11 items-center rounded-md px-3 text-sm font-medium text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
        >
          {link.label}
        </a>
      ))}
    </nav>`;
    const normalized = normalizeGeneratedSiteContent(input);
    const anchorMatches = normalized.match(/<a\b[^>]*>/gs) || [];
    for (const a of anchorMatches) {
      const classCount = (a.match(/\bclassName=/g) || []).length;
      expect(classCount).toBe(1);
    }
  });
});

describe("normalizeBatchedSiteAnchors", () => {
  it("anchors the accepted composition pattern on the home route", () => {
    const [file] = normalizeBatchedSiteAnchors(
      [{ path: "src/routes/index.tsx", content: "<main><h1>Home</h1></main>" }],
      { compositionPatternId: "split-commerce-hero" },
    );

    expect(file?.content).toContain(
      '<main data-pattern="split-commerce-hero">',
    );
  });

  it("maps accepted palette literals onto compiled semantic tokens", () => {
    const [file] = normalizeBatchedSiteAnchors(
      [
        {
          path: "src/routes/index.tsx",
          content:
            '<main className="bg-[#f7f3ec] text-[#3d2b1f]"><svg fill="#d4a017" stroke="#3d2b1f" /></main>',
        },
      ],
      {
        palette: {
          background: "#f7f3ec",
          foreground: "#3d2b1f",
          muted: "#e5ddd2",
          accent: "#d4a017",
        },
      },
    );

    expect(file?.content).toContain("bg-background");
    expect(file?.content).toContain("text-foreground");
    expect(file?.content).toContain('fill="currentColor"');
    expect(file?.content).toContain('stroke="currentColor"');
    expect(file?.content).not.toContain("#f7f3ec");
  });

  it("normalizes visual safety utility mistakes without changing content", () => {
    const [file] = normalizeBatchedSiteAnchors([
      {
        path: "src/routes/index.tsx",
        content:
          '<main className="h-screen"><p className="text-muted">Jelas</p><li className="border-l-2 border-accent">Info</li><div className="bg-foreground text-foreground/75">Kontak</div><SiteSection surface="contrast"><p className="text-muted-foreground">Info</p></SiteSection></main>',
      },
    ]);

    expect(file?.content).toContain("min-h-dvh");
    expect(file?.content).not.toContain("min-min-h-dvh");
    expect(file?.content).toContain("text-muted-foreground");
    expect(file?.content).not.toContain("h-screen");
    expect(file?.content).not.toContain('text-muted"');
    expect(file?.content).not.toContain("border-l-2");
    // Reproduced live: text-muted-foreground inside SiteSection surface=
    expect(file?.content).toContain("text-background/75");
    expect(file?.content).not.toContain("text-foreground/75");
    expect(file?.content).toContain('<p className="text-background">Info</p>');
  });

  // Reproduced live: a real build's CTA button paired bg-accent with bare
  it("heals a light-surface text colour on its own bg-accent or bg-primary element", () => {
    const [file] = normalizeBatchedSiteAnchors([
      {
        path: "src/routes/index.tsx",
        content:
          '<a className="bg-accent px-6 text-foreground">Chat</a><a className="bg-primary px-6 text-muted-foreground/80">Lihat</a>',
      },
    ]);

    expect(file?.content).toContain(
      '<a className="bg-accent px-6 text-accent-foreground">Chat</a>',
    );
    expect(file?.content).toContain(
      '<a className="bg-primary px-6 text-primary-foreground/80">Lihat</a>',
    );
  });

  // Reproduced live: a real writer response correctly emitted text-background
  it("leaves text-background untouched inside a contrast surface section", () => {
    const [file] = normalizeBatchedSiteAnchors([
      {
        path: "src/routes/index.tsx",
        content:
          '<main><SiteSection surface="contrast"><p className="text-background/75">Info</p></SiteSection><p className="text-background">Outside</p></main>',
      },
    ]);

    expect(file?.content).toContain(
      '<p className="text-background/75">Info</p>',
    );
    expect(file?.content).toContain(
      '<p className="text-foreground">Outside</p>',
    );
  });

  it("removes internal starter metadata from the customer route", () => {
    const [file] = normalizeBatchedSiteAnchors([
      {
        path: "src/routes/index.tsx",
        content: '<main data-generated-site-starter="true">A</main>',
      },
    ]);

    expect(file?.content).not.toContain("data-generated-site-starter");
  });

  it("anchors a pattern on a non-main route root", () => {
    const [file] = normalizeBatchedSiteAnchors(
      [{ path: "src/routes/index.tsx", content: "<div><h1>Home</h1></div>" }],
      { compositionPatternId: "split-commerce-hero" },
    );

    expect(file?.content).toContain('<div data-pattern="split-commerce-hero">');
  });

  it("repairs default route exports and void preview-hook value usage", () => {
    const [file] = normalizeBatchedSiteAnchors([
      {
        path: "src/routes/index.tsx",
        content: `import { usePreviewReady } from "@/lib/preview-ready";
export default function IndexRoute() {
  const previewReady = usePreviewReady();
  return <main data-preview-ready={previewReady ? "true" : "false"} />;
}`,
      },
    ]);

    expect(file?.content).toContain("export function HomeRouteComponent()");
    expect(file?.content).toContain("usePreviewReady();");
    expect(file?.content).toContain("const previewReady = true;");
    expect(file?.content).not.toContain("export default");
    expect(file?.content).not.toContain("previewReady ?");
  });

  it("turns missing chat anchors into the reviewed WhatsApp target and a touch-safe CTA", () => {
    const [file] = normalizeBatchedSiteAnchors(
      [
        {
          path: "src/routes/index.tsx",
          content:
            '<main><a href="#chat" className="rounded-lg">{site.primaryCta}</a></main>',
        },
      ],
      { photoEnabled: false, primaryCtaTarget: "08123456789" },
    );

    expect(file?.content).toContain(
      'href="https://wa.me/628123456789?text=Halo"',
    );
    expect(file?.content).toContain("min-h-11");
    expect(file?.content).not.toContain('href="#chat"');
  });

  it("turns a text-only primary CTA into a touch-safe WhatsApp link", () => {
    const [file] = normalizeBatchedSiteAnchors(
      [
        {
          path: "src/routes/index.tsx",
          content:
            '<main><span className="cta-primary">{site.primaryCta}</span></main>',
        },
      ],
      { primaryCtaTarget: "08123456789" },
    );

    expect(file?.content).toContain(
      '<a className="inline-flex min-h-11 min-w-11 items-center justify-center cta-primary" href="https://wa.me/628123456789?text=Halo"',
    );
    expect(file?.content).toContain("cta-primary");
  });

  it("makes generated action links touch-safe, including multi-page navigation", () => {
    const [file] = normalizeBatchedSiteAnchors(
      [
        {
          path: "src/components/site/generated-shell.tsx",
          content:
            '<nav><a href="/katalog" className="font-semibold">Lihat katalog</a></nav>',
        },
      ],
      { primaryCtaTarget: "08123456789" },
    );

    expect(file?.content).toContain("inline-flex min-h-11");
  });

  it("makes short action links wide enough for the touch target", () => {
    const [file] = normalizeBatchedSiteAnchors([
      {
        path: "src/routes/katalog.tsx",
        content:
          '<a href="https://wa.me/628123456789" className="inline-flex min-h-11 items-center text-sm">{site.primaryCta}</a>',
      },
    ]);

    expect(file?.content).toContain("min-w-11");
  });

  it("adds the accepted primary action to a generated route that omitted it", () => {
    const [file] = normalizeBatchedSiteAnchors(
      [
        {
          path: "src/routes/lokasi.tsx",
          content: "<main><h1>{site.headline}</h1></main>",
        },
      ],
      { ensurePrimaryCta: true, primaryCtaTarget: "08123456789" },
    );

    expect(file?.content).toContain(
      'href="https://wa.me/628123456789?text=Halo"',
    );
    expect(file?.content).toContain("site.primaryCta");
    expect(file?.content).toContain("min-h-11");
  });

  it("heals dynamic foreground surfaces and their descendants", () => {
    const [file] = normalizeBatchedSiteAnchors([
      {
        path: "src/routes/katalog.tsx",
        content: `<article className={\`rounded-xl \${index === 0 ? "bg-foreground text-foreground" : "bg-muted text-foreground"}\`}><h2 className={\`\${index === 0 ? "text-foreground" : "text-foreground"}\`}>Produk</h2></article>`,
      },
    ]);

    expect(file?.content).toContain("bg-foreground text-background");
    expect(file?.content).not.toContain(
      '"text-foreground" : "text-foreground"',
    );
  });

  it("heals light text when a child resets to a background surface", () => {
    const [file] = normalizeBatchedSiteAnchors([
      {
        path: "src/routes/lokasi.tsx",
        content:
          '<SiteSection surface="contrast"><div className="bg-background p-7"><h2 className="text-background">Lokasi</h2><p className="text-background">Alamat</p><a href="https://wa.me/628123456789" className="bg-primary text-background">Chat</a></div></SiteSection>',
      },
    ]);

    expect(file?.content).toContain(
      '<h2 className="text-foreground">Lokasi</h2>',
    );
    expect(file?.content).toContain(
      '<p className="text-foreground">Alamat</p>',
    );
    expect(file?.content).toContain("bg-primary text-primary-foreground");
  });

  it("renders structured payment values through their display field", () => {
    const [file] = normalizeBatchedSiteAnchors([
      {
        path: "src/routes/lokasi.tsx",
        content: '<p>{site.paymentMethods.join(" dan ")}</p>',
      },
    ]);

    expect(file?.content).toContain(
      'site.paymentMethods.map((item) => item.method).join(" dan ")',
    );
    expect(file?.content).not.toContain("site.paymentMethods.join");
  });

  it("replaces an empty hash primary CTA with the reviewed WhatsApp target", () => {
    const [file] = normalizeBatchedSiteAnchors(
      [
        {
          path: "src/routes/index.tsx",
          content:
            '<main><a className="rounded-full" href="#">{site.primaryCta}</a></main>',
        },
      ],
      { primaryCtaTarget: "08123456789" },
    );

    expect(file?.content).toContain(
      'href="https://wa.me/628123456789?text=Halo"',
    );
    expect(file?.content).not.toContain('href="#"');
  });

  it("normalizes unsupported SiteSplit emphasis and props", () => {
    const [file] = normalizeBatchedSiteAnchors([
      {
        path: "src/routes/index.tsx",
        content:
          '<main><SiteSplit emphasis="left" left={<div />} right={<div />}>A</SiteSplit></main>',
      },
    ]);

    expect(file?.content).toContain('emphasis="leading"');
    expect(file?.content).not.toContain('emphasis="left"');
    expect(file?.content).not.toContain(" left=");
    expect(file?.content).not.toContain(" right=");
  });

  it("moves unsupported SiteCluster gap props into Tailwind classes", () => {
    const [file] = normalizeBatchedSiteAnchors([
      {
        path: "src/routes/index.tsx",
        content:
          '<main><SiteCluster justify="start" gap="lg" className="items-center">A</SiteCluster></main>',
      },
    ]);

    expect(file?.content).not.toContain('gap="lg"');
    expect(file?.content).toContain('className="items-center"');
  });

  it("canonicalizes preview-ready imports emitted under common wrong names", () => {
    const [file] = normalizeBatchedSiteAnchors([
      {
        path: "src/routes/index.tsx",
        content: [
          'import { usePreviewReady } from "@/lib/use-preview-ready"',
          'import { site } from "../content/site"',
          "export function HomeRouteComponent() { usePreviewReady(); return <main /> }",
        ].join("\\n"),
      },
    ]);

    expect(file?.content).toContain('from "@/lib/preview-ready"');
    expect(file?.content).not.toContain("use-preview-ready");
  });

  it("does not invent a contact target when the contract has none", () => {
    const [file] = normalizeBatchedSiteAnchors(
      [
        {
          path: "src/routes/index.tsx",
          content: '<main><a href="#chat">Chat</a></main>',
        },
      ],
      { photoEnabled: false },
    );

    expect(file?.content).toContain('href="#chat"');
    expect(file?.content).not.toContain("wa.me");
  });
});

describe("inspectGeneratedSiteSource", () => {
  it("rejects site fields absent from platform-owned content", () => {
    const input = contract();
    const source = `import { site } from "@/content/site"; export function HomeRouteComponent(){ return <main><h1>{site.headline}</h1><p>{site.primaryCta.label}</p>{site.sections.map((section) => <p>{section.id}</p>)}</main> }`;
    const result = inspectGeneratedSiteSource({
      contract: input,
      designPlan: plan(),
      files: [
        { path: "src/routes/index.tsx", content: source },
        {
          path: "src/content/site.ts",
          content: `export const site = ${JSON.stringify({ headline: "SuryaPhone", primaryCta: "Pesan", sections: [{ title: "Penawaran", body: "Isi" }] })} as const;`,
        },
      ],
      starterIndexSource: "data-generated-site-starter",
      themeChecks: [],
    });
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown-site-field",
          path: "src/routes/index.tsx",
          message: expect.stringContaining("site.primaryCta.label"),
        }),
        expect.objectContaining({
          code: "unknown-site-field",
          path: "src/routes/index.tsx",
          message: expect.stringContaining("section.id"),
        }),
      ]),
    );
  });

  it("rejects case-insensitive duplicate file paths", () => {
    const source = `<main><h1>SuryaPhone</h1><a href="#kontak">Chat WhatsApp</a><section id="kontak">iPhone 11 Garansi QRIS Jabodetabek</section></main>`;
    const files: GeneratedProjectFile[] = [
      { path: "src/routes/index.tsx", content: source },
      { path: "src/components/ui/Button.tsx", content: "export const A = 1" },
      { path: "src/components/ui/button.tsx", content: "export const B = 1" },
    ];
    const reportWithDuplicate = inspectGeneratedSiteSource({
      contract: contract(),
      designPlan: plan(),
      files,
      starterIndexSource: "data-generated-site-starter",
      themeChecks: [
        {
          role: "foreground",
          foreground: "#ffffff",
          background: "#000000",
          ratio: 21,
          minimum: 4.5,
          pass: true,
        },
      ],
    });
    expect(reportWithDuplicate.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate-case-insensitive-path" }),
      ]),
    );
  });

  it("rejects the shipped SuryaPhone starter-derived failure", () => {
    const result = report(`
      // Replace this with the real home page built from the brief
      export function HomeRouteComponent() {
        return <main className="mx-auto max-w-3xl">
          <h1>Products</h1>
          <h2>HeroSection</h2>
          <a href={link.handle}>Connect With Us</a>
          <a href="#kontak">Chat WhatsApp</a>
        </main>;
      }
    `);
    expect(result.status).toBe("fail");
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "starter-residue",
        "customer-copy-english",
        "technical-heading",
        "missing-anchor-target",
        "social-handle-href",
        "missing-required-content",
      ]),
    );
  });

  it("accepts a complete image-free catalog composition", () => {
    const result = report(`
      import { site } from "@/content/site";
      export function HomeRouteComponent() {
        return <main>
          <section><h1>{site.headline}</h1><p>{site.subheadline}</p></section>
          <section id="catalog"><h2>Katalog</h2>{site.products.map((p) => <article key={p.name}>{p.name}</article>)}</section>
          <section><h2>Keunggulan</h2>{site.usp.map((item) => <p key={item}>{item}</p>)}</section>
          <section><h2>Pembayaran</h2>{site.paymentMethods.map((item) => <p key={item.method}>{item.method}</p>)}</section>
          <section><h2>Wilayah layanan</h2><p>{site.address}</p><p>{site.deliveryArea}</p></section>
          <section id="kontak"><a href="https://wa.me/628123456789">{site.primaryCta}</a></section>
          <footer>{site.socialLinks.map((link) => <a key={link.platform} href={link.url}>{link.handle}</a>)}</footer>
        </main>;
      }
    `);
    expect(result.findings).toEqual([]);
    expect(result.status).toBe("pass");
  });

  it("rejects a contract response without a design plan", () => {
    const result = inspectGeneratedSiteSource({
      contract: contract(),
      designPlan: null as unknown as WriterDesignPlanV1,
      files: [
        {
          path: "src/routes/index.tsx",
          content:
            "<main data-generated-site-starter><h1>SuryaPhone</h1></main>",
        },
      ],
      starterIndexSource: "data-generated-site-starter",
      themeChecks: [],
    });

    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["missing-design-plan", "starter-residue"]),
    );
  });

  it("rejects a hardcoded catalog that bypasses accepted site fields", () => {
    const result = report(
      `<main><h1>Gamis pilihan</h1><a href="https://wa.me/628123456789">Chat</a></main>`,
    );

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "contract-data-bypass" }),
      ]),
    );
  });

  it("rejects placeholders when the photo feature compiled image-free mode", () => {
    const result = report(
      `<img src="/placeholder.svg" alt="Ganti foto nanti" />`,
      { mediaMode: "typographic" },
    );
    expect(
      result.findings.some(
        (finding) => finding.code === "placeholder-forbidden",
      ),
    ).toBe(true);
  });
});
