"use strict";

const TRANSPARENT_CSS_COLOR_PATTERN = String.raw`^rgba\([^)]*,\s*0\s*\)$`;

function isTransparentCssColor(value) {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "transparent" ||
    new RegExp(TRANSPARENT_CSS_COLOR_PATTERN, "i").test(normalized)
  );
}

function parseCssColor(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const hex = normalized.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      return {
        r: Number.parseInt(digits[0] + digits[0], 16),
        g: Number.parseInt(digits[1] + digits[1], 16),
        b: Number.parseInt(digits[2] + digits[2], 16),
        a:
          digits.length === 4
            ? Number.parseInt(digits[3] + digits[3], 16) / 255
            : 1,
      };
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        r: Number.parseInt(digits.slice(0, 2), 16),
        g: Number.parseInt(digits.slice(2, 4), 16),
        b: Number.parseInt(digits.slice(4, 6), 16),
        a:
          digits.length === 8
            ? Number.parseInt(digits.slice(6, 8), 16) / 255
            : 1,
      };
    }
    return null;
  }
  const rgb = normalized.match(/^rgba?\((.*)\)$/i);
  if (!rgb) {
    return null;
  }
  const parts = rgb[1]
    .replaceAll(",", " ")
    .replace("/", " / ")
    .trim()
    .split(/\s+/);
  const slashIndex = parts.indexOf("/");
  const channels = slashIndex >= 0 ? parts.slice(0, slashIndex) : parts;
  const alphaValue = slashIndex >= 0 ? parts[slashIndex + 1] : channels[3];
  if (channels.length < 3) {
    return null;
  }
  const channel = (part) => {
    const numeric = Number.parseFloat(part);
    return part.endsWith("%") ? (numeric / 100) * 255 : numeric;
  };
  const alpha = alphaValue === undefined ? 1 : Number.parseFloat(alphaValue);
  const color = {
    r: channel(channels[0]),
    g: channel(channels[1]),
    b: channel(channels[2]),
    a: alpha,
  };
  if (
    Object.values(color).some((component) => Number.isNaN(component)) ||
    color.r < 0 ||
    color.r > 255 ||
    color.g < 0 ||
    color.g > 255 ||
    color.b < 0 ||
    color.b > 255 ||
    color.a < 0 ||
    color.a > 1
  ) {
    return null;
  }
  return color;
}

function composite(foreground, background) {
  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (alpha === 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  return {
    r:
      (foreground.r * foreground.a +
        background.r * background.a * (1 - foreground.a)) /
      alpha,
    g:
      (foreground.g * foreground.a +
        background.g * background.a * (1 - foreground.a)) /
      alpha,
    b:
      (foreground.b * foreground.a +
        background.b * background.a * (1 - foreground.a)) /
      alpha,
    a: alpha,
  };
}

function channelLuminance(channel) {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color) {
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  );
}

function contrastRatio(foreground, background) {
  const foregroundColor = parseCssColor(foreground);
  const backgroundColor = parseCssColor(background);
  if (!foregroundColor || !backgroundColor || backgroundColor.a === 0) {
    return null;
  }
  const compositedForeground =
    foregroundColor.a < 1
      ? composite(foregroundColor, backgroundColor)
      : foregroundColor;
  const light = Math.max(
    luminance(compositedForeground),
    luminance(backgroundColor),
  );
  const dark = Math.min(
    luminance(compositedForeground),
    luminance(backgroundColor),
  );
  return (light + 0.05) / (dark + 0.05);
}

function minimumForText(input) {
  const fontSize = Number.parseFloat(input.fontSize);
  const fontWeight = Number.parseInt(input.fontWeight, 10);
  return fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700) ? 3 : 4.5;
}

function findContrastFailures(entries) {
  return entries.flatMap((entry) => {
    const ratio = contrastRatio(entry.foreground, entry.background);
    if (ratio === null) {
      return [];
    }
    const minimum = minimumForText(entry);
    return ratio >= minimum ? [] : [{ ...entry, ratio, minimum }];
  });
}

function evaluateProfessionalTypography(input) {
  const failures = [];
  if (input.bodyFontSizePx < input.minBodyPx) {
    failures.push(`body font ${input.bodyFontSizePx}px < ${input.minBodyPx}px`);
  }
  if (input.bodyLineHeightRatio < input.minBodyLineHeight) {
    failures.push(
      `body line-height ${input.bodyLineHeightRatio} < ${input.minBodyLineHeight}`,
    );
  }
  if (input.bodyMaxCh > input.maxBodyCh) {
    failures.push(`body measure ${input.bodyMaxCh}ch > ${input.maxBodyCh}ch`);
  }
  for (const heading of input.displayHeadings ?? []) {
    if (heading.fontSizePx > input.maxDisplayPx) {
      failures.push(
        `display ${heading.fontSizePx}px > ${input.maxDisplayPx}px`,
      );
    }
    if (heading.letterSpacingEm < input.minDisplayLetterSpacingEm) {
      failures.push(
        `display tracking ${heading.letterSpacingEm}em < ${input.minDisplayLetterSpacingEm}em`,
      );
    }
  }
  return { pass: failures.length === 0, failures };
}

function normalizeVisibleText(value) {
  return String(value || "")
    .replace(/\\s+/g, " ")
    .trim()
    .toLocaleLowerCase("id-ID");
}

function evaluateFirstViewContract(input) {
  const failures = [];
  const firstViewText = normalizeVisibleText(input.firstViewText);
  if (input.firstViewCount !== undefined && input.firstViewCount !== 1) {
    failures.push("first-view-count");
  }
  if (!input.firstViewVisible) {
    failures.push("first-view-hidden");
  }
  if (
    !normalizeVisibleText(input.identityText) ||
    !firstViewText.includes(normalizeVisibleText(input.identityText))
  ) {
    failures.push("identity-missing");
  }
  for (const offer of input.offerTexts ?? []) {
    if (!firstViewText.includes(normalizeVisibleText(offer))) {
      failures.push("offer-missing");
      break;
    }
  }
  if (
    input.primaryActionCount !== undefined &&
    input.primaryActionCount !== 1
  ) {
    failures.push("primary-action-count");
  }
  const action = input.primaryAction;
  if (
    !action ||
    !action.visible ||
    normalizeVisibleText(action.label) !==
      normalizeVisibleText(input.primaryCtaLabel) ||
    action.href !== input.primaryCtaHref
  ) {
    failures.push("primary-action-mismatch");
  }
  return { pass: failures.length === 0, failures };
}

function evaluateSectionCoverage(input) {
  const failures = [];
  const actual = input.actualSections ?? [];
  const seen = new Set();
  for (const section of actual) {
    if (seen.has(section.id)) {
      failures.push(`duplicate:${section.id}`);
    }
    seen.add(section.id);
  }
  const expected = input.expectedSections ?? [];
  for (const section of expected) {
    const matches = actual.filter((candidate) => candidate.id === section.id);
    if (matches.length !== 1 || !matches[0].visible) {
      failures.push(`missing:${section.id}`);
      continue;
    }
    const text = normalizeVisibleText(matches[0].text);
    for (const requiredText of section.requiredVisibleTexts ?? []) {
      if (!text.includes(normalizeVisibleText(requiredText))) {
        failures.push(`text:${section.id}`);
        break;
      }
    }
  }
  const expectedOrder = expected.map((section) => section.id).join("|");
  const actualOrder = actual.map((section) => section.id).join("|");
  if (expectedOrder !== actualOrder) {
    failures.push("order");
  }
  return { pass: failures.length === 0, failures };
}

function rectanglesOverlap(left, right) {
  return (
    Math.max(
      0,
      Math.min(left.right, right.right) - Math.max(left.left, right.left),
    ) *
      Math.max(
        0,
        Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top),
      ) >
    0
  );
}

function evaluateFixedOverlaps(input) {
  const failures = [];
  for (const fixed of input.fixedRects ?? []) {
    for (const target of input.targetRects ?? []) {
      if (rectanglesOverlap(fixed, target)) {
        failures.push(`${fixed.label || "fixed"}:${target.label || "target"}`);
      }
    }
  }
  return { pass: failures.length === 0, failures };
}

function evaluateEmptyMediaFrame(input) {
  const empty =
    input.area >= 12000 &&
    input.borderedOrBackgrounded &&
    !input.visibleText &&
    !input.hasImage &&
    !input.hasSvgPath;
  return { pass: !empty, failures: empty ? ["empty-media-frame"] : [] };
}

function evaluateSignaturePresence(input) {
  const expected = input.route === input.signatureRoute;
  const valid = expected
    ? input.count === 1 && input.visibleCount === 1 && input.hasVisibleText
    : input.count === 0;
  return {
    pass: valid,
    failures: valid
      ? []
      : [expected ? "missing-or-duplicate-signature" : "unexpected-signature"],
  };
}

module.exports = {
  contrastRatio,
  findContrastFailures,
  evaluateEmptyMediaFrame,
  evaluateFixedOverlaps,
  evaluateFirstViewContract,
  evaluateProfessionalTypography,
  evaluateSectionCoverage,
  evaluateSignaturePresence,
  isTransparentCssColor,
  minimumForText,
  parseCssColor,
  TRANSPARENT_CSS_COLOR_PATTERN,
};
