import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  evaluateEmptyMediaFrame,
  evaluateFixedOverlaps,
  evaluateFirstViewContract,
  evaluateProfessionalTypography,
  evaluateSectionCoverage,
  evaluateSignaturePresence,
  isTransparentCssColor,
  minimumForText,
} from "./generated-site-contrast";

describe("generated-site-contrast", () => {
  it("dark body text on warm background passes AA", () => {
    expect((contrastRatio("#3d2b1f", "#f7f3ec") ?? 0) >= 4.5).toBe(true);
  });

  it("light muted text on warm background fails AA", () => {
    expect((contrastRatio("#e5ddd2", "#f7f3ec") ?? 0) < 4.5).toBe(true);
  });

  it("large text uses the 3:1 threshold", () => {
    expect(minimumForText({ fontSize: "24px", fontWeight: "400" })).toBe(3);
  });

  it("recognizes transparent browser colors", () => {
    expect(isTransparentCssColor("transparent")).toBe(true);
    expect(isTransparentCssColor("rgba(0, 0, 0, 0)")).toBe(true);
    expect(isTransparentCssColor("rgba(0, 0, 0, 0.1)")).toBe(false);
  });

  it("enforces professional typography boundaries exactly", () => {
    const base = {
      bodyFontSizePx: 15,
      bodyLineHeightRatio: 1.4,
      bodyMaxCh: 78,
      minBodyPx: 15,
      minBodyLineHeight: 1.4,
      maxBodyCh: 78,
      maxDisplayPx: 96,
      minDisplayLetterSpacingEm: -0.04,
      displayHeadings: [{ fontSizePx: 96, letterSpacingEm: -0.04 }],
    };
    expect(evaluateProfessionalTypography(base).pass).toBe(true);
    expect(
      evaluateProfessionalTypography({ ...base, bodyFontSizePx: 14 }).pass,
    ).toBe(false);
    expect(
      evaluateProfessionalTypography({
        ...base,
        displayHeadings: [{ fontSizePx: 97, letterSpacingEm: -0.04 }],
      }).pass,
    ).toBe(false);
  });

  it("requires identity, offer, and exact primary action in the first view", () => {
    const input = {
      firstViewVisible: true,
      firstViewText: "Kedai Senja Kopi Senja",
      identityText: "Kedai Senja",
      offerTexts: ["Kopi Senja"],
      primaryCtaLabel: "Pesan",
      primaryCtaHref: "https://wa.me/1",
      primaryAction: {
        visible: true,
        label: "Pesan",
        href: "https://wa.me/1",
      },
    };
    expect(evaluateFirstViewContract(input).pass).toBe(true);
    expect(
      evaluateFirstViewContract({
        ...input,
        primaryAction: { ...input.primaryAction, href: "#" },
      }).pass,
    ).toBe(false);
  });

  it("checks section order and required visible text", () => {
    const expectedSections = [
      { id: "hero", requiredVisibleTexts: ["Kopi Senja"] },
      { id: "contact", requiredVisibleTexts: ["Pesan"] },
    ];
    const actualSections = [
      { id: "hero", visible: true, text: "Kopi Senja" },
      { id: "contact", visible: true, text: "Pesan" },
    ];
    expect(
      evaluateSectionCoverage({ expectedSections, actualSections }).pass,
    ).toBe(true);
    expect(
      evaluateSectionCoverage({
        expectedSections,
        actualSections: [
          { id: "hero", visible: true, text: "Kopi Senja" },
          { id: "contact", visible: true, text: "Beli" },
        ],
      }).pass,
    ).toBe(false);
  });

  it("checks overlap and empty media frames", () => {
    expect(
      evaluateFixedOverlaps({
        fixedRects: [{ left: 0, right: 10, top: 0, bottom: 10 }],
        targetRects: [{ left: 5, right: 15, top: 5, bottom: 15 }],
      }).pass,
    ).toBe(false);
    expect(
      evaluateEmptyMediaFrame({
        area: 13000,
        borderedOrBackgrounded: true,
        visibleText: false,
        hasImage: false,
        hasSvgPath: false,
      }).pass,
    ).toBe(false);
  });

  it("evaluates signature presence per route", () => {
    expect(
      evaluateSignaturePresence({
        route: "/",
        signatureRoute: "/",
        count: 1,
        visibleCount: 1,
        hasVisibleText: true,
      }).pass,
    ).toBe(true);
    expect(
      evaluateSignaturePresence({
        route: "/other",
        signatureRoute: "/",
        count: 1,
        visibleCount: 1,
        hasVisibleText: true,
      }).pass,
    ).toBe(false);
  });
});
