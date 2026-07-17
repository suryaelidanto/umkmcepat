import { describe, expect, it } from "vitest";

import { parseProjectBrief } from "./brief";
import {
  buildImplementationSpecPrompt,
  implementationSpecFromBrief,
  implementationSpecToSiteSchema,
  parseImplementationSpec,
} from "./implementation-spec";

describe("implementation spec", () => {
  it("accepts AI-decided interactive app structure instead of forcing landing", () => {
    const spec = parseImplementationSpec({
      appKind: "interactive_app",
      businessName: "Barber Rapi",
      pages: [
        {
          slug: "/",
          title: "Booking potong rambut tanpa ribet",
          purpose: "Membantu pelanggan memilih layanan dan niat jadwal.",
        },
      ],
      components: [
        {
          name: "BookingIntent",
          purpose: "Form statis pilihan layanan dan waktu.",
        },
        { name: "ServiceMenu", purpose: "Daftar layanan barber." },
      ],
      features: ["booking_intent_form", "service_menu"],
      content: {
        offer: "Potong rambut dan grooming",
        audience: "Pria aktif",
      },
      style: {
        direction: "Maskulin, rapi, kontras hangat.",
        palette: {
          background: "#f7f7f7",
          foreground: "#111111",
          muted: "#666666",
          accent: "#8b4513",
        },
      },
      primaryCta: "Pilih jadwal",
      notes: [],
    });

    expect(spec?.appKind).toBe("interactive_app");
    expect(spec?.features).toContain("booking_intent_form");
    expect(implementationSpecToSiteSchema(spec!).eyebrow).toBe(
      "Aplikasi interaktif",
    );
  });

  it("parse stays strict; incomplete AI objects stay null", () => {
    expect(parseImplementationSpec({ appKind: "landing" })).toBeNull();
  });

  it("implementationSpecFromBrief always parses for thrift-like ready brief", () => {
    const brief = parseProjectBrief(
      {
        readyForBuild: true,
        confidence: 95,
        businessName: "Surya Thrift Store",
        businessType: "Thrift kaos",
        offer: "Kaos thrifting branded",
        targetCustomer: "Remaja SMA/kuliah",
        contactOrCta: "WhatsApp 08123456789",
        stylePreference: "Streetwear muda",
        tagline: "Branded Luar, Harga Dalam Negeri",
        productOrService: [{ name: "Kaos branded", isPrimary: true }],
        paymentMethods: ["transfer"],
        priceRange: "di bawah 50rb",
        notes: ["Full online"],
      },
      "website jualan baju thrift",
    );
    const spec = implementationSpecFromBrief(brief);
    const parsed = parseImplementationSpec(spec);
    expect(parsed).not.toBeNull();
    expect(parsed?.businessName).toContain("Surya");
    expect(parsed?.notes).toContain("spec_source:brief_fallback");
    expect(parsed?.components.length).toBeGreaterThanOrEqual(2);
  });

  it("implementationSpecFromBrief works for minimal ready brief", () => {
    const brief = parseProjectBrief(
      {
        readyForBuild: true,
        confidence: 90,
        businessName: "Kopi Kita",
        offer: "Kopi susu",
        productOrService: [{ name: "Kopi", isPrimary: true }],
        contactOrCta: "Chat WA",
        targetCustomer: "Mahasiswa",
      },
      "buat web kopi",
    );
    expect(
      parseImplementationSpec(implementationSpecFromBrief(brief)),
    ).not.toBeNull();
  });

  it("keeps legacy brief metadata as prompt context without making it the structure", () => {
    const prompt = buildImplementationSpecPrompt(
      parseProjectBrief(
        {
          confidence: 96,
          businessType: "Rental PS",
          offer: "Paket rental PS per jam",
          notes: ["Butuh katalog paket dan aturan booking"],
        },
        "buat app rental ps",
      ),
    );

    expect(prompt).toContain("Rental PS");
    expect(prompt).toContain("AI confidence: 96%");
    expect(prompt).not.toContain("primaryCta");
  });
});
