import { describe, expect, it } from "vitest";

import { detectImageFormat } from "@/lib/storage/images/format";
import { optimizeImageToWebp } from "@/lib/storage/images/optimize";

describe("optimizeImageToWebp", () => {
  const VALID_PNG_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  it("converts input PNG buffer to valid WebP buffer", async () => {
    const input = Buffer.from(VALID_PNG_BASE64, "base64");
    const result = await optimizeImageToWebp(input);

    expect(result.format).toBe("webp");
    expect(result.contentType).toBe("image/webp");
    expect(detectImageFormat(result.bytes)).toBe("webp");
    expect(result.bytes.length).toBeGreaterThan(0);
  });
});
