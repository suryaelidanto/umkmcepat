import { describe, expect, it } from "vitest";

import { scanSourceClaims, type ClaimMatch } from "./high-risk-claims";

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

  it("flags a phone literal even without a scheme", () => {
    const matches: ClaimMatch[] = scanSourceClaims("Hubungi 0812-3456-7890.");
    expect(matches.some((m) => m.category === "contact")).toBe(true);
  });
});
