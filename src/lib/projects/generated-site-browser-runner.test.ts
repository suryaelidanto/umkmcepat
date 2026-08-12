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
        storeEvidence: async () => "ref",
      },
    );
    expect(result.status).toBe("infrastructure_error");
  });
});
