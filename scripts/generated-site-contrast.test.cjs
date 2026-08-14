/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test matches the browser subprocess helper. */
const assert = require("node:assert/strict");
const test = require("node:test");

const {
  contrastRatio,
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
