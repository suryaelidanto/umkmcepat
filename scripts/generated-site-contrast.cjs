"use strict";

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

module.exports = {
  contrastRatio,
  findContrastFailures,
  minimumForText,
  parseCssColor,
};
