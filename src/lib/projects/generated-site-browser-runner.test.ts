import { describe, expect, it } from "vitest";

import {
  parseBrowserRunnerOutput,
  runGeneratedSiteBrowserGates,
} from "./generated-site-browser-runner";

import type { GeneratedSiteContractV1 } from "./generated-site-contract";

const contract = {
  schemaVersion: 1,
  contractHash: "a".repeat(64),
  business: {
    name: "Test",
    type: "service",
    audience: null,
    primaryJob: "Contact",
    primaryCta: { kind: "other", label: "Contact", target: "#contact" },
  },
  content: {
    headline: "Test",
    subheadline: "Test",
    offer: "Test",
    promotion: null,
    trustPoints: [],
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
  page: {
    appKind: "landing",
    archetype: "generic",
    routes: [{ path: "/", purpose: "home", requiredContent: [] }],
    requiredSections: [],
    prohibitedClaims: [],
  },
  design: {
    recipeId: "generic",
    recipeVersion: 1,
    composition: "content-led",
    hierarchy: [],
    typographyStrategy: "system",
    colorStrategy: "restrained",
    mediaMode: "typographic",
    approvedAssets: [],
    signatureElement: "content-led hero",
    antiPatterns: [],
  },
} satisfies GeneratedSiteContractV1;

describe("parseBrowserRunnerOutput", () => {
  it("parses bounded mobile and desktop reports", () => {
    const result = parseBrowserRunnerOutput(
      JSON.stringify({
        routes: [
          {
            route: "/",
            viewport: "mobile",
            assertions: [{ name: "route-load", status: "pass" }],
          },
          {
            route: "/",
            viewport: "desktop",
            assertions: [{ name: "route-load", status: "pass" }],
          },
        ],
        screenshots: [],
      }),
    );
    expect(result.routes).toHaveLength(2);
  });

  it("rejects malformed subprocess output", () => {
    expect(() => parseBrowserRunnerOutput("not-json")).toThrow(
      "generated-site browser output malformed",
    );
  });
});

describe("runGeneratedSiteBrowserGates", () => {
  it("classifies launch failure as infrastructure_error", async () => {
    const result = await runGeneratedSiteBrowserGates(
      {
        projectId: "p1",
        candidateId: "c1",
        files: [
          { path: "index.html", content: "<main />", contentType: "text/html" },
        ],
        contract,
        timeoutMs: 100,
      },
      {
        execute: async () => {
          throw new Error("browser unavailable");
        },
        storeEvidence: async () => ["ref"],
      },
    );
    expect(result.status).toBe("infrastructure_error");
  });

  const browserIt =
    process.env.RUN_GENERATED_SITE_BROWSER_TESTS === "1" ? it : it.skip;

  browserIt("qualifies a real static artifact at both viewports", async () => {
    const evidence: Array<{ screenshot?: Uint8Array }> = [];
    const result = await runGeneratedSiteBrowserGates(
      {
        projectId: "browser-smoke",
        candidateId: "candidate-smoke",
        files: [
          {
            path: "index.html",
            contentType: "text/html; charset=utf-8",
            content: `<!doctype html><html><head><style>*{box-sizing:border-box}body{margin:0;color:#172019;background:#fffaf0;font:18px system-ui}main{min-height:100vh;padding:48px}a{display:inline-flex;min-width:160px;min-height:48px;align-items:center;justify-content:center;background:#173f2a;color:white;border-radius:12px}a:focus{outline:3px solid #d18b22}</style></head><body><main><h1>Warung Uji</h1><p>Menu harian untuk keluarga sekitar.</p><a href="https://wa.me/6281100000000">Hubungi kami</a></main></body></html>`,
          },
        ],
        contract,
        timeoutMs: 10_000,
      },
      {
        storeEvidence: async (item) => {
          evidence.push({ screenshot: item.screenshot });
          return [`evidence-${evidence.length}`];
        },
      },
    );
    expect(result.status).toBe("pass");
    expect(result.routes).toHaveLength(2);
    expect(result.routes.flatMap((route) => route.assertions)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "primary-cta", status: "pass" }),
        expect.objectContaining({
          name: "horizontal-overflow",
          status: "pass",
        }),
      ]),
    );
    expect(evidence.every((item) => (item.screenshot?.length ?? 0) > 0)).toBe(
      true,
    );
  });
});
