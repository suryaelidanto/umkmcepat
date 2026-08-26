import { describe, expect, it } from "vitest";

import {
  LANDSCAPE_PLACEHOLDER_SVG,
  PLACEHOLDER_DATA_URIS,
  pickPlaceholderDataUri,
  PORTRAIT_PLACEHOLDER_SVG,
} from "./placeholders";

describe("placeholder assets", () => {
  it("exports transparent fallback data URIs", () => {
    const expected =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    expect(LANDSCAPE_PLACEHOLDER_SVG).toBe(expected);
    expect(PORTRAIT_PLACEHOLDER_SVG).toBe(expected);
    expect(PLACEHOLDER_DATA_URIS.landscape).toBe(expected);
    expect(PLACEHOLDER_DATA_URIS.portrait).toBe(expected);
  });

  it("pickPlaceholderDataUri returns transparent 1px fallback", () => {
    const expected =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    expect(pickPlaceholderDataUri(300, 600)).toBe(expected);
    expect(pickPlaceholderDataUri(600, 300)).toBe(expected);
  });
});
