import { describe, expect, it } from "vitest";

import {
  applyBriefValidator,
  briefToBuildPrompt,
  createInitialBrief,
  getMissingBriefFields,
  isBriefReady,
  isBriefReadyForBuild,
  parseProjectBrief,
} from "./brief";

import type { CleanedBrief } from "./brief-rich-fields";

describe("project brief", () => {
  it("creates a safe initial brief", () => {
    const brief = createInitialBrief("buat web toko baju");

    expect(brief.prompt).toBe("buat web toko baju");
    expect(isBriefReady(brief)).toBe(false);
    expect(getMissingBriefFields(brief)).toContain("businessType");
  });

  it("parses unknown values safely", () => {
    expect(parseProjectBrief(null, "halo").prompt).toBe("halo");
    expect(
      parseProjectBrief({ businessType: " Fashion  " }, "halo").businessType,
    ).toBe("Fashion");
  });

  it("does not mark ready from legacy fields alone; confidence is the gate", () => {
    const brief = parseProjectBrief(
      {
        businessType: "Fashion",
        offer: "Katalog produk",
        targetCustomer: "Anak muda",
        contactOrCta: "Chat WA",
        stylePreference: "Bold gelap",
      },
      "buat web",
    );

    expect(isBriefReady(brief)).toBe(false);
    expect(briefToBuildPrompt(brief)).toContain("Bidang usaha: Fashion");
  });

  it("marks ready only when AI confidence reaches 95 and no open questions remain", () => {
    expect(
      isBriefReady(
        parseProjectBrief({ confidence: 94, openQuestions: [] }, "buat web"),
      ),
    ).toBe(false);
    expect(
      isBriefReady(
        parseProjectBrief(
          { confidence: 95, openQuestions: ["Jam buka belum jelas"] },
          "buat web",
        ),
      ),
    ).toBe(false);
    expect(
      isBriefReady(
        parseProjectBrief({ confidence: 95, openQuestions: [] }, "buat web"),
      ),
    ).toBe(true);
  });
});

describe("applyBriefValidator + isBriefReadyForBuild", () => {
  const fullClean: CleanedBrief = {
    businessName: "Kopi Tuku",
    productOrService: [{ name: "Kopi Susu", isPrimary: true }],
    contact: { channel: "whatsapp", value: "08123456789", label: undefined },
    tagline: "Kopi susu enak harga mahasiswa",
    usp: ["Biji single origin"],
    targetCustomer: "Mahasiswa",
    priceRange: "15-25rb",
    visuals: true,
    hours: [
      {
        dayRange: "Senin-Jumat",
        open: "08:00",
        close: "21:00",
        note: undefined,
      },
    ],
    address: "Jl. Kaliurang KM 5",
    deliveryArea: "Sleman",
    since: "2018",
    testimonials: [
      { quote: "Mantap", author: "Ibu Rina", context: undefined, rating: 5 },
    ],
    certifications: [{ name: "Halal", issuer: undefined }],
    paymentMethods: [{ method: "qris", detail: undefined }],
    socialLinks: [
      { platform: "instagram", handle: "@kopituku", url: undefined },
    ],
    currentPromo: null,
    secondaryCta: null,
  };

  it("isBriefReadyForBuild is false when readyForBuild is false", () => {
    const brief = applyBriefValidator({ ...fullClean, businessName: null });
    expect(isBriefReadyForBuild(brief)).toBe(false);
  });

  it("isBriefReadyForBuild is true when readyForBuild is true and productOrService present", () => {
    const brief = applyBriefValidator(fullClean);
    brief.readyForBuild = true;
    expect(isBriefReadyForBuild(brief)).toBe(true);
  });

  it("applyBriefValidator populates all fields from a CleanedBrief", () => {
    const brief = applyBriefValidator(fullClean);
    expect(brief.businessName).toBe("Kopi Tuku");
    expect(brief.contact?.channel).toBe("whatsapp");
    expect(brief.paymentMethods?.[0].method).toBe("qris");
  });

  it("applyBriefValidator defaults readyForBuild to false", () => {
    const brief = applyBriefValidator(fullClean);
    expect(brief.readyForBuild).toBe(false);
  });
});
