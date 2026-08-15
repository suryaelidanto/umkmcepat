/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test matches the browser subprocess helper. */
const assert = require("node:assert/strict");
const test = require("node:test");

const {
  contrastRatio,
  evaluateEmptyMediaFrame,
  evaluateFixedOverlaps,
  evaluateFirstViewContract,
  evaluateProfessionalTypography,
  evaluateSectionCoverage,
  evaluateSignaturePresence,
  isTransparentCssColor,
  minimumForText,
} = require("./generated-site-contrast.cjs");

test("dark body text on warm background passes AA", () => {
  assert.ok(contrastRatio("#3d2b1f", "#f7f3ec") >= 4.5);
});

test("light muted text on warm background fails AA", () => {
  assert.ok(contrastRatio("#e5ddd2", "#f7f3ec") < 4.5);
});

test("large text uses the 3:1 threshold", () => {
  assert.equal(minimumForText({ fontSize: "24px", fontWeight: "400" }), 3);
});

test("recognizes transparent browser colors", () => {
  assert.equal(isTransparentCssColor("transparent"), true);
  assert.equal(isTransparentCssColor("rgba(0, 0, 0, 0)"), true);
  assert.equal(isTransparentCssColor("rgba(0, 0, 0, 0.1)"), false);
});

test("enforces professional typography boundaries exactly", () => {
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
  assert.equal(evaluateProfessionalTypography(base).pass, true);
  assert.equal(
    evaluateProfessionalTypography({ ...base, bodyFontSizePx: 14 }).pass,
    false,
  );
  assert.equal(
    evaluateProfessionalTypography({
      ...base,
      displayHeadings: [{ fontSizePx: 97, letterSpacingEm: -0.04 }],
    }).pass,
    false,
  );
});

test("requires identity, offer, and exact primary action in the first view", () => {
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
  assert.equal(evaluateFirstViewContract(input).pass, true);
  assert.equal(
    evaluateFirstViewContract({
      ...input,
      primaryAction: { ...input.primaryAction, href: "#" },
    }).pass,
    false,
  );
});

test("checks section order and required visible text", () => {
  const expectedSections = [
    { id: "hero", requiredVisibleTexts: ["Kopi Senja"] },
    { id: "contact", requiredVisibleTexts: ["Pesan"] },
  ];
  const actualSections = [
    { id: "hero", visible: true, text: "Kopi Senja" },
    { id: "contact", visible: true, text: "Pesan" },
  ];
  assert.equal(
    evaluateSectionCoverage({ expectedSections, actualSections }).pass,
    true,
  );
  assert.equal(
    evaluateSectionCoverage({
      expectedSections,
      actualSections: [...actualSections].reverse(),
    }).pass,
    false,
  );
});

test("detects fixed overlap and only treats substantial empty frames as media failures", () => {
  assert.equal(
    evaluateFixedOverlaps({
      fixedRects: [{ left: 0, right: 100, top: 0, bottom: 50, label: "nav" }],
      targetRects: [
        { left: 10, right: 90, top: 20, bottom: 80, label: "hero" },
      ],
    }).pass,
    false,
  );
  assert.equal(
    evaluateEmptyMediaFrame({
      area: 12000,
      borderedOrBackgrounded: true,
      visibleText: false,
      hasImage: false,
      hasSvgPath: false,
    }).pass,
    false,
  );
  assert.equal(
    evaluateEmptyMediaFrame({
      area: 12000,
      borderedOrBackgrounded: true,
      visibleText: false,
      hasImage: false,
      hasSvgPath: true,
    }).pass,
    true,
  );
});

test("enforces route-aware signature presence", () => {
  assert.equal(
    evaluateSignaturePresence({
      route: "/",
      signatureRoute: "/",
      count: 1,
      visibleCount: 1,
      hasVisibleText: true,
    }).pass,
    true,
  );
  assert.equal(
    evaluateSignaturePresence({
      route: "/kelas",
      signatureRoute: "/",
      count: 1,
      visibleCount: 1,
      hasVisibleText: true,
    }).pass,
    false,
  );
});
