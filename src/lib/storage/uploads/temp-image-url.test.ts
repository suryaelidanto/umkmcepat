import { describe, expect, it } from "vitest";

import { isExpiredTempImageUrl } from "./temp-image-url";

function tempImageUrl(expiresAt: number) {
  const payload = Buffer.from(JSON.stringify({ expiresAt })).toString(
    "base64url",
  );
  return `/api/uploads/temp-images/${payload}.signature`;
}

describe("isExpiredTempImageUrl", () => {
  it("recognizes an expired signed temp-image URL without requesting it", () => {
    expect(
      isExpiredTempImageUrl(tempImageUrl(1_790_000_000_000), 1_790_000_000_001),
    ).toBe(true);
  });

  it("keeps a live temp-image URL eligible to load", () => {
    expect(
      isExpiredTempImageUrl(tempImageUrl(1_790_000_000_000), 1_789_999_999_999),
    ).toBe(false);
  });

  it("does not classify permanent or malformed URLs as expired", () => {
    expect(isExpiredTempImageUrl("/api/media/asset_1", 1_790_000_000_001)).toBe(
      false,
    );
    expect(
      isExpiredTempImageUrl(
        "/api/uploads/temp-images/not-a-token.signature",
        1_790_000_000_001,
      ),
    ).toBe(false);
  });
});
