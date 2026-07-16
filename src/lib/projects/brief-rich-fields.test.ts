import { describe, expect, it } from "vitest";

import {
  FIELD_APPLICABILITY,
  getApplicableFields,
  parseContact,
  parsePaymentMethod,
  parseProductOrServiceItem,
  parseCertification,
  parseHours,
  parseSocialLink,
  parseTestimonial,
  SOFT_FIELDS,
  validateBrief,
} from "@/lib/projects/brief-rich-fields";

describe("brief rich-field parsers", () => {
  it("parses a valid contact", () => {
    expect(parseContact({ channel: "whatsapp", value: "08123456789" })).toEqual(
      {
        channel: "whatsapp",
        value: "08123456789",
        label: undefined,
      },
    );
  });

  it("rejects a contact with a non-phone value for whatsapp", () => {
    expect(
      parseContact({ channel: "whatsapp", value: "not-a-number" }),
    ).toBeNull();
  });

  it("rejects an instagram contact whose value lacks an @ or instagram.com", () => {
    expect(
      parseContact({ channel: "instagram", value: "hello world" }),
    ).toBeNull();
  });

  it("parses a social link with a valid platform and handle", () => {
    expect(
      parseSocialLink({ platform: "instagram", handle: "@kopi.tuku" }),
    ).toEqual({
      platform: "instagram",
      handle: "@kopi.tuku",
      url: undefined,
    });
  });

  it("rejects an empty payment method", () => {
    expect(parsePaymentMethod("")).toBeNull();
  });

  it("parses a known payment method", () => {
    expect(parsePaymentMethod("qris")).toEqual({
      method: "qris",
      detail: undefined,
    });
  });

  it("parses a certification with a name", () => {
    expect(parseCertification({ name: "Halal" })).toEqual({
      name: "Halal",
      issuer: undefined,
    });
  });

  it("rejects an hours entry missing open or close", () => {
    expect(parseHours({ dayRange: "Senin-Jumat", open: "08:00" })).toBeNull();
  });

  it("parses a hours entry with all fields", () => {
    expect(
      parseHours({ dayRange: "Senin-Jumat", open: "08:00", close: "21:00" }),
    ).toEqual({
      dayRange: "Senin-Jumat",
      open: "08:00",
      close: "21:00",
      note: undefined,
    });
  });

  it("parses a testimonial with rating clamped to 1..5", () => {
    expect(
      parseTestimonial({ quote: "Mantap", author: "Ibu Rina", rating: 9 }),
    ).toEqual({
      quote: "Mantap",
      author: "Ibu Rina",
      context: undefined,
      rating: 5,
    });
  });

  it("parses a productOrService item marking isPrimary", () => {
    expect(
      parseProductOrServiceItem({ name: "Nasi Goreng", isPrimary: true }),
    ).toEqual({
      name: "Nasi Goreng",
      description: undefined,
      priceRange: undefined,
      isPrimary: true,
    });
  });
});

describe("field applicability", () => {
  it("always-on fields are in every type's applicable set", () => {
    const alwaysOn: ReadonlyArray<"contact" | "tagline" | "usp" | "visuals"> = [
      "contact",
      "tagline",
      "usp",
      "visuals",
    ];
    for (const t of Object.keys(FIELD_APPLICABILITY) as Array<
      keyof typeof FIELD_APPLICABILITY
    >) {
      for (const f of alwaysOn) {
        expect(getApplicableFields(t)).toContain(f);
      }
    }
  });

  it("F&B applicability includes hours, address, paymentMethods, priceRange, since", () => {
    const applicable = getApplicableFields("fnb");
    expect(applicable).toContain("hours");
    expect(applicable).toContain("address");
    expect(applicable).toContain("paymentMethods");
    expect(applicable).toContain("priceRange");
    expect(applicable).toContain("since");
  });

  it("online-only jasa excludes address, hours, deliveryArea", () => {
    const applicable = getApplicableFields("jasa_online");
    expect(applicable).not.toContain("address");
    expect(applicable).not.toContain("hours");
    expect(applicable).not.toContain("deliveryArea");
  });

  it("SOFT_FIELDS is the union of all field ids", () => {
    expect(SOFT_FIELDS).toContain("contact");
    expect(SOFT_FIELDS).toContain("testimonials");
    expect(SOFT_FIELDS).toContain("secondaryCta");
  });
});

describe("validateBrief", () => {
  it("keeps a well-formed businessName", () => {
    const result = validateBrief({
      businessName: "Kopi Tuku",
      productOrService: "Kopi",
    });
    expect(result.dropped).toEqual([]);
    expect(result.cleaned.businessName).toBe("Kopi Tuku");
  });

  it("keeps a single-word non-empty businessName (AI's job to push back, not the validator's)", () => {
    const result = validateBrief({ businessName: "Toko" });
    expect(result.dropped).toEqual([]);
    expect(result.cleaned.businessName).toBe("Toko");
  });

  it("drops a hallucinated phone number contact", () => {
    const result = validateBrief({
      businessName: "Kopi Tuku",
      contact: { channel: "whatsapp", value: "hello world" },
    });
    expect(result.dropped).toContain("contact");
    expect(result.cleaned.contact).toBeNull();
  });

  it("keeps a valid whatsapp contact", () => {
    const result = validateBrief({
      businessName: "Kopi Tuku",
      contact: { channel: "whatsapp", value: "08123456789" },
    });
    expect(result.dropped).toEqual([]);
    expect(result.cleaned.contact).toEqual({
      channel: "whatsapp",
      value: "08123456789",
      label: undefined,
    });
  });

  it("drops a priceRange that is just dots", () => {
    const result = validateBrief({
      businessName: "Kopi Tuku",
      priceRange: "....",
    });
    expect(result.dropped).toContain("priceRange");
  });

  it("keeps a sensible priceRange", () => {
    const result = validateBrief({
      businessName: "Kopi Tuku",
      priceRange: "20-50rb",
    });
    expect(result.dropped).toEqual([]);
    expect(result.cleaned.priceRange).toBe("20-50rb");
  });
});
