import { afterEach, describe, expect, it } from "vitest";

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

describe("temp image token secret resolution", () => {
  const envNames = ["NEXTAUTH_SECRET", "AUTH_SECRET"] as const;
  const previous = Object.fromEntries(
    envNames.map((name) => [name, process.env[name]]),
  );
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    for (const name of envNames) {
      const value = previous[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    process.env.NODE_ENV = previousNodeEnv;
  });

  it("signs and verifies with NEXTAUTH_SECRET", () => {
    process.env.NEXTAUTH_SECRET = "a-real-secret-that-is-long-enough-1234";
    delete process.env.AUTH_SECRET;

    const token = signTempImageToken(payload);
    expect(verifyTempImageToken(token)).toEqual(payload);
  });

  it("rejects a token signed with a different secret (signature is meaningful)", () => {
    process.env.NEXTAUTH_SECRET = "secret-one-that-is-long-enough-1234";
    const token = signTempImageToken(payload);

    process.env.NEXTAUTH_SECRET = "secret-two-that-is-long-enough-5678";
    expect(verifyTempImageToken(token)).toBeNull();
  });

  it("throws in production when no secret is configured", () => {
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.AUTH_SECRET;
    process.env.NODE_ENV = "production";

    expect(() => signTempImageToken(payload)).toThrow(
      /NEXTAUTH_SECRET.*required in production/,
    );
  });

  it("keeps the dev fallback outside production", () => {
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.AUTH_SECRET;
    process.env.NODE_ENV = "test";

    const token = signTempImageToken(payload);
    expect(verifyTempImageToken(token)).toEqual(payload);
  });
});
