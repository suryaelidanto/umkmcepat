import { describe, expect, it } from "vitest";

import { inspectGeneratedSiteSource } from "./generated-site-gates";

import type { WriterDesignPlanV1 } from "./batched-response";
import type { GeneratedSiteContractV1 } from "./generated-site-contract";
import type { GeneratedProjectFile } from "./generated-types";

const SITE = {
  businessName: "SuryaPhone",
  headline: "Pilih iPhone dengan kondisi jelas",
  trustPoints: ["Kondisi tercatat"],
  usp: ["Kondisi unit tercatat"],
  products: [{ name: "iPhone 13", description: "Battery health tercatat" }],
  paymentMethods: [{ method: "qris" }],
  sections: [{ title: "Katalog", description: "Daftar unit" }],
  testimonials: [],
  socialLinks: [
    {
      platform: "instagram",
      handle: "@suryaphone",
      url: "https://instagram.com/suryaphone",
    },
  ],
};

function contract(): GeneratedSiteContractV1 {
  return {
    schemaVersion: 1,
    contractHash: "a".repeat(64),
    business: {
      name: "SuryaPhone",
      type: "retail",
      audience: "Pembeli iPhone bekas",
      primaryJob: "Memilih iPhone",
      primaryCta: { kind: "whatsapp", label: "Chat", target: "https://wa.me" },
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
      mediaMode: "graphic",
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

const INDEX = `import { site } from "@/content/site";
import { usePreviewReady } from "@/lib/preview-ready";
export function HomeRouteComponent() {
  usePreviewReady();
  return (
    <main>
      {site.trustPoints.map((t) => <div key={t}>{t}</div>)}
      {site.usp.map((u) => <div key={u}>{u}</div>)}
      {site.products.map((p) => <div key={p.name}>{p.name}</div>)}
      <p>{site.paymentMethods.join(" dan ")}</p>
      {site.sections.map((s) => <section key={s.title}>{s.title}</section>)}
    </main>
  );
}`;

describe("inspectGeneratedSiteSource — array method calls", () => {
  it("does not flag site.<arrayField>.map as an unknown site field", () => {
    const files: GeneratedProjectFile[] = [
      { path: "src/routes/index.tsx", content: INDEX },
      {
        path: "src/content/site.ts",
        content: `export const site = ${JSON.stringify(SITE)} as const;`,
      },
    ];
    const result = inspectGeneratedSiteSource({
      contract: contract(),
      designPlan: plan(),
      files,
      starterIndexSource: "data-generated-site-starter",
      themeChecks: [],
    });
    const unknownField = result.findings.filter(
      (f) => f.code === "unknown-site-field",
    );
    expect(unknownField).toEqual([]);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "structured-array-serialization" }),
      ]),
    );
  });
});
