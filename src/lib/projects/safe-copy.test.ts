import { describe, expect, it } from "vitest";

import { classifySafeCopy } from "./safe-copy";

describe("classifySafeCopy", () => {
  it("recognizes an exact owner fact rendering", () => {
    expect(
      classifySafeCopy({ text: "Kopi Senja", ownerFacts: ["Kopi Senja"] }),
    ).toBe("fact_rendering");
  });

  it("recognizes fact-preserving polish around owner evidence", () => {
    expect(
      classifySafeCopy({
        text: "Kopi Senja untuk jeda sore.",
        ownerFacts: ["Kopi Senja"],
      }),
    ).toBe("fact_preserving_polish");
  });

  it("recognizes navigation labels", () => {
    expect(classifySafeCopy({ text: "Lihat menu" })).toBe("navigation");
  });

  it("recognizes neutral calls to action", () => {
    expect(classifySafeCopy({ text: "Pesan lewat WhatsApp" })).toBe(
      "neutral_cta",
    );
  });

  it("recognizes atmospheric framing without a business claim", () => {
    expect(classifySafeCopy({ text: "Ruang untuk jeda sore." })).toBe(
      "atmospheric_framing",
    );
  });

  it("rejects unsupported promotional language", () => {
    expect(classifySafeCopy({ text: "Kopi terbaik dan terlaris." })).toBe(
      "unsupported_claim",
    );
  });

  it("rejects unsupported contact literals", () => {
    expect(classifySafeCopy({ text: "Hubungi 08123456789" })).toBe(
      "unsupported_claim",
    );
  });

  it("allows an owner-supplied price when it is explicitly grounded", () => {
    expect(
      classifySafeCopy({
        text: "Kopi susu Rp 18.000",
        ownerFacts: ["Rp 18.000"],
      }),
    ).toBe("fact_preserving_polish");
  });

  it("fails closed for empty copy", () => {
    expect(classifySafeCopy({ text: "   " })).toBe("unsupported_claim");
  });
});
