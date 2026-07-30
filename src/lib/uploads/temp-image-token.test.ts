import { describe, expect, it } from "vitest";

import {
  signTempImageToken,
  verifyTempImageToken,
  type TempImageTokenPayload,
} from "./temp-image-token";

const payload: TempImageTokenPayload = {
  contentType: "image/png",
  expiresAt: 1790000000000,
  key: "temp-uploads/user_1/1790000000000/file.png",
  sizeBytes: 123,
  userId: "user_1",
};

describe("temp image tokens", () => {
  it("round-trips a signed payload", () => {
    expect(verifyTempImageToken(signTempImageToken(payload))).toEqual(payload);
  });

  it("rejects a tampered token", () => {
    const token = signTempImageToken(payload);
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    expect(verifyTempImageToken(tampered)).toBeNull();
  });
});
