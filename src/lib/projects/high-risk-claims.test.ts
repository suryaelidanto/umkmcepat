import { describe, expect, it } from "vitest";

import { scanSourceClaims } from "./high-risk-claims";

describe("scanSourceClaims", () => {
  it.each([
    ["<a href='https://wa.me/628123456789'>Chat</a>", "contact"],
    ["Harga Rp 25.000", "price"],
    ["Buka Senin 08.00-17.00", "hours"],
    ["Rating 4.9/5", "proof"],
    ["Telp: 08123456789", "contact"],
  ] as const)("blocks raw high-risk source: %s", (source, category) => {
    const matches = scanSourceClaims(source);
    expect(matches.some((m) => m.category === category)).toBe(true);
  });

  it.each([
    "Kualitas yang bisa Anda rasakan di setiap suapan.",
    "Beras berkualitas.",
    "Beras berkualitas, harga terjangkau, antar sampai tujuan.",
    "Harga terjangkau untuk keluarga.",
    "Beras pilihan untuk keluarga Anda.",
    "Harga mulai.",
  ])("blocks unsupported soft promotional copy: %s", (source) => {
    const matches = scanSourceClaims(source);
    expect(matches.some((match) => match.category === "soft_promotion")).toBe(
      true,
    );
  });

  it.each([
    "Tanpa bahan kimia, langsung dari alam.",
    "Nasi pulen, cocok untuk makan sehari-hari.",
    "Stok segar, diproses dari mesin giling.",
    "Kami antar ke rumah tanpa ongkos tambahan.",
  ])("blocks unsupported derived business copy: %s", (source) => {
    const matches = scanSourceClaims(source);
    expect(matches.some((match) => match.category === "soft_promotion")).toBe(
      true,
    );
  });

  it("allows an accepted soft claim literal when the owner supplied it", () => {
    expect(
      scanSourceClaims("Beras berkualitas.", undefined, ["Beras berkualitas"]),
    ).toEqual([]);
  });

  it("does not let an accepted route slash corrupt an accepted price literal", () => {
    const source =
      'const site = { routes: [{ path: "/" }], priceRange: "Rp 14.000 - Rp 17.000 / kg" };';
    expect(
      scanSourceClaims(source, undefined, ["/", "Rp 14.000 - Rp 17.000 / kg"]),
    ).toEqual([]);
  });

  it("allows a stable fact-id reference without embedding its literal", () => {
    const matches = scanSourceClaims(
      '<ContractAction factId="contact-primary" />',
    );
    expect(matches).toEqual([]);
  });

  it("does not flag qualitative non-measurable copy", () => {
    const matches = scanSourceClaims(
      "Sate kami dibuat dengan bumbu kacang asli.",
    );
    expect(matches).toEqual([]);
  });

  it("reports the offending literal instead of the entire source", () => {
    const matches = scanSourceClaims("Kemasannya 5 kg.");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.category).toBe("quantity");
    expect(matches[0]?.normalizedValue).toBe("5 kg");
  });

  it("allows dynamic site.contact bindings and SVG paths without hardcoded phone literals", () => {
    const dynamicLink =
      "<a href={`https://wa.me/${site.contact}`}>Hubungi Kami</a>";
    expect(scanSourceClaims(dynamicLink)).toEqual([]);

    const svgIcon =
      '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3" /></svg>';
    expect(scanSourceClaims(svgIcon)).toEqual([]);
  });
});
