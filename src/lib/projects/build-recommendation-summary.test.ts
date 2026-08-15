import { describe, expect, it } from "vitest";

import { describeBuildRecommendation } from "./build-recommendation-summary";

import type { BuildContractV1 } from "./build-contract";
import type { BuildPlanV1 } from "./build-plan";

function contract(overrides: Partial<BuildContractV1> = {}): BuildContractV1 {
  return {
    identity: { businessName: "Seblak Surya", businessType: "fnb" },
    facts: [
      {
        id: "offer-primary",
        kind: "offer",
        value: [
          { name: "Seblak Ceker", isPrimary: true, priceRange: "Rp10.000" },
          { name: "Seblak Ceker Bakso Sosis", priceRange: "Rp15.000" },
          { name: "Seblak Sultan", priceRange: "Rp20.000" },
        ],
      },
      {
        id: "contact-primary",
        kind: "contact",
        value: {
          label: "Chat WhatsApp",
          value: "08123456789",
          channel: "whatsapp",
        },
      },
      {
        id: "hours-primary",
        kind: "hours",
        value: [{ dayRange: "Setiap hari", open: "08.00", close: "21.00" }],
      },
      {
        id: "address-primary",
        kind: "address",
        value: { line1: "Jl. Kenangan No 4, Jakarta Utara" },
      },
      {
        id: "payment-primary",
        kind: "payment_method",
        value: [{ method: "qris" }, { method: "cash" }],
      },
    ],
    ctaIntents: [
      {
        id: "cta-primary",
        kind: "whatsapp",
        label: "Chat WhatsApp",
        targetFactId: "contact-primary",
      },
    ],
    preferences: { visualDirection: "Pedas dan menggugah selera" },
    ...overrides,
  } as unknown as BuildContractV1;
}

function plan(pageCount = 1): BuildPlanV1 {
  return {
    pages: Array.from({ length: pageCount }, (_, index) => ({
      id: index === 0 ? "home" : `page-${index}`,
      path: index === 0 ? "/" : `/page-${index}`,
      title: "Seblak Surya",
    })),
  } as unknown as BuildPlanV1;
}

describe("describeBuildRecommendation", () => {
  it("tells the owner what goes on the site in their own words", () => {
    const lines = describeBuildRecommendation(contract(), plan());

    expect(lines).toEqual([
      "Menampilkan: Seblak Ceker, Seblak Ceker Bakso Sosis, Seblak Sultan",
      "Harga ikut ditampilkan",
      "Pengunjung diarahkan ke WhatsApp",
      "Ikut tampil: jam buka, alamat, cara pembayaran",
      "Gaya: Pedas dan menggugah selera",
    ]);
  });

  it("never leaks internals a shop owner should not have to read", () => {
    const text = describeBuildRecommendation(contract(), plan()).join(" | ");

    expect(text).not.toMatch(/fnb/i);
    expect(text).not.toMatch(/keyakinan|confidence|%/i);
    expect(text).not.toMatch(/contract|hash|fact|schema|id\b/i);
  });

  it("counts long catalogues instead of listing every item", () => {
    const many = contract({
      facts: [
        {
          id: "offer-primary",
          kind: "offer",
          value: Array.from({ length: 9 }, (_, index) => ({
            name: `Menu ${index + 1}`,
          })),
        },
      ],
    } as unknown as Partial<BuildContractV1>);

    expect(describeBuildRecommendation(many, plan())[0]).toBe(
      "Menampilkan 9 pilihan",
    );
  });

  it("mentions extra pages only when there is more than one", () => {
    expect(
      describeBuildRecommendation(contract(), plan(1)).join(" "),
    ).not.toMatch(/halaman/);
    expect(describeBuildRecommendation(contract(), plan(2))).toContain(
      "2 halaman",
    );
  });

  it("stays quiet about detail the owner never gave", () => {
    const sparse = contract({
      facts: [
        {
          id: "offer-primary",
          kind: "offer",
          value: [{ name: "Seblak Ceker" }],
        },
      ],
      preferences: { visualDirection: null },
    } as unknown as Partial<BuildContractV1>);
    const lines = describeBuildRecommendation(sparse, plan());

    expect(lines).toEqual([
      "Menampilkan: Seblak Ceker",
      "Pengunjung diarahkan ke WhatsApp",
    ]);
  });

  it("names the channel rather than the model's CTA wording", () => {
    // The stored intent label can be as vague as "Chat", which tells a shop
    // owner nothing about where their customers land.
    const vague = contract({
      ctaIntents: [
        {
          id: "cta-primary",
          kind: "whatsapp",
          label: "Chat",
          targetFactId: "contact-primary",
        },
      ],
    } as unknown as Partial<BuildContractV1>);

    expect(describeBuildRecommendation(vague, plan())).toContain(
      "Pengunjung diarahkan ke WhatsApp",
    );
  });
});
