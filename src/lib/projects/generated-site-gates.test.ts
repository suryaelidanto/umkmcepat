import { describe, expect, it } from "vitest";

import { inspectGeneratedSiteSource } from "./generated-site-gates";

import type { WriterDesignPlanV1 } from "./batched-response";
import type { GeneratedSiteContractV1 } from "./generated-site-contract";
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

describe("inspectGeneratedSiteSource", () => {
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
