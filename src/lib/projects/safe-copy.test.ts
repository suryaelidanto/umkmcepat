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

  it("matches owner facts without depending on letter case", () => {
    expect(
      classifySafeCopy({
        text: "KOPI SENJA",
        ownerFacts: ["Kopi Senja"],
      }),
    ).toBe("fact_rendering");
  });

  it("allows owner facts to be framed with a neutral sentence", () => {
    expect(
      classifySafeCopy({
        text: "Pilihan dari Kopi Senja.",
        ownerFacts: ["Kopi Senja"],
      }),
    ).toBe("fact_preserving_polish");
  });

  it("allows an owner-supplied location only when grounded", () => {
    expect(
      classifySafeCopy({
        text: "Temui kami di Jalan Melati.",
        ownerFacts: ["Jalan Melati"],
      }),
    ).toBe("fact_preserving_polish");
  });

  it("allows an owner-supplied operating detail only when grounded", () => {
    expect(
      classifySafeCopy({
        text: "Buka Senin sampai Jumat.",
        ownerFacts: ["Senin sampai Jumat"],
      }),
    ).toBe("fact_preserving_polish");
  });

  it("recognizes a contact CTA without inventing a destination", () => {
    expect(classifySafeCopy({ text: "Tanya pilihan yang tersedia" })).toBe(
      "neutral_cta",
    );
  });

  it("recognizes a booking CTA", () => {
    expect(classifySafeCopy({ text: "Booking sekarang" })).toBe("neutral_cta");
  });

  it("recognizes a simple navigation label", () => {
    expect(classifySafeCopy({ text: "Kembali ke beranda" })).toBe("navigation");
  });

  it("recognizes calm atmospheric framing", () => {
    expect(classifySafeCopy({ text: "Momen tenang untuk jeda." })).toBe(
      "atmospheric_framing",
    );
  });

  it("rejects an unsupported quality superlative", () => {
    expect(classifySafeCopy({ text: "Paling murah di kota." })).toBe(
      "unsupported_claim",
    );
  });

  it("rejects unsupported popularity language", () => {
    expect(classifySafeCopy({ text: "Pilihan nomor satu pelanggan." })).toBe(
      "unsupported_claim",
    );
  });

  it("rejects an unsupported testimonial claim", () => {
    expect(classifySafeCopy({ text: "Disukai ribuan pelanggan." })).toBe(
      "unsupported_claim",
    );
  });

  it("rejects unsupported credentials", () => {
    expect(classifySafeCopy({ text: "Bersertifikat resmi." })).toBe(
      "unsupported_claim",
    );
  });

  it("fails closed for unrelated prose", () => {
    expect(
      classifySafeCopy({ text: "Kami memberikan pengalaman terbaik." }),
    ).toBe("unsupported_claim");
  });

  it("fails closed for empty copy", () => {
    expect(classifySafeCopy({ text: "   " })).toBe("unsupported_claim");
  });
});
