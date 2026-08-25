import { describe, expect, it } from "vitest";

import {
  LANDSCAPE_PLACEHOLDER_SVG,
  PLACEHOLDER_DATA_URIS,
  pickPlaceholderDataUri,
  PORTRAIT_PLACEHOLDER_SVG,
} from "./placeholders";

describe("placeholder assets", () => {
  it("exports transparent fallback without text", () => {
    expect(LANDSCAPE_PLACEHOLDER_SVG).toBeDefined();
    expect(PORTRAIT_PLACEHOLDER_SVG).toBeDefined();
    expect(PLACEHOLDER_DATA_URIS.landscape).toContain("data:image");
    expect(PLACEHOLDER_DATA_URIS.portrait).toContain("data:image");
  });

  it("pickPlaceholderDataUri returns a valid data URI", () => {
    expect(pickPlaceholderDataUri(300, 600)).toContain("data:image");
    expect(pickPlaceholderDataUri(600, 300)).toContain("data:image");
  });
});
