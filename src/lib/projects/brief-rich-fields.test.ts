import { describe, expect, it } from "vitest";

import {
  parseContact,
  parseSocialLink,
  parsePaymentMethod,
  parseCertification,
  parseHours,
  parseTestimonial,
  parseProductOrServiceItem,
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
