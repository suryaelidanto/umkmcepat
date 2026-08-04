import { describe, expect, it } from "vitest";

import {
  LANDSCAPE_PLACEHOLDER_SVG,
  PLACEHOLDER_DATA_URIS,
  pickPlaceholderDataUri,
  PORTRAIT_PLACEHOLDER_SVG,
} from "./placeholders";

describe("placeholder assets", () => {
  it("exports landscape and portrait SVGs with neutral copy", () => {
    expect(LANDSCAPE_PLACEHOLDER_SVG).toContain('viewBox="0 0 600 400"');
    expect(LANDSCAPE_PLACEHOLDER_SVG).toContain("Tidak ada foto");
    expect(LANDSCAPE_PLACEHOLDER_SVG).toContain("</svg>");
    expect(PORTRAIT_PLACEHOLDER_SVG).toContain('viewBox="0 0 400 600"');
    expect(PORTRAIT_PLACEHOLDER_SVG).toContain("Tidak ada foto");
    expect(PORTRAIT_PLACEHOLDER_SVG).toContain("</svg>");
  });

  it("exposes both kinds as data URIs", () => {
    expect(PLACEHOLDER_DATA_URIS.landscape).toMatch(
      /^data:image\/svg\+xml;base64,/,
    );
    expect(PLACEHOLDER_DATA_URIS.portrait).toMatch(
      /^data:image\/svg\+xml;base64,/,
    );
    expect(PLACEHOLDER_DATA_URIS.landscape).not.toBe(
      PLACEHOLDER_DATA_URIS.portrait,
    );
  });

  it("picks portrait for tall images and landscape for wide images", () => {
    expect(pickPlaceholderDataUri(300, 600)).toBe(
      PLACEHOLDER_DATA_URIS.portrait,
    );
    expect(pickPlaceholderDataUri(600, 300)).toBe(
      PLACEHOLDER_DATA_URIS.landscape,
    );
    expect(pickPlaceholderDataUri(400, 400)).toBe(
      PLACEHOLDER_DATA_URIS.landscape,
    );
  });
});
