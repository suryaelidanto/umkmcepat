import { afterEach, describe, expect, it } from "vitest";

import {
  createTurnstileVerifiedValue,
  turnstileVerifiedCookie,
  TURNSTILE_VERIFIED_COOKIE,
  verifyTurnstileVerification,
} from "@/lib/auth/turnstile-gate";

const envNames = ["NEXTAUTH_SECRET", "AUTH_SECRET"] as const;
const previous = Object.fromEntries(
  envNames.map((name) => [name, process.env[name]]),
);
const previousNodeEnv = process.env.NODE_ENV;

function requestWithCookie(value: string): Request {
  return new Request("http://localhost/api/auth/signin/google", {
    headers: { cookie: `${TURNSTILE_VERIFIED_COOKIE}=${value}` },
  });
}

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

describe("turnstile verification gate", () => {
  const now = 1_790_000_000_000;

  it("verifies a freshly issued value", () => {
    const value = createTurnstileVerifiedValue(now);
    expect(verifyTurnstileVerification(requestWithCookie(value), now)).toBe(
      true,
    );
  });

  it("rejects a tampered signature", () => {
    const value = createTurnstileVerifiedValue(now);
    const tampered = `${value.slice(0, -1)}${value.endsWith("a") ? "b" : "a"}`;
    expect(verifyTurnstileVerification(requestWithCookie(tampered), now)).toBe(
      false,
    );
  });

  it("rejects an expired value beyond the grace window", () => {
    const value = createTurnstileVerifiedValue(now);
    const later = now + 11 * 60 * 1000;
    expect(verifyTurnstileVerification(requestWithCookie(value), later)).toBe(
      false,
    );
  });

  it("rejects a value issued in the future", () => {
    const value = createTurnstileVerifiedValue(now + 60_000);
    expect(verifyTurnstileVerification(requestWithCookie(value), now)).toBe(
      false,
    );
  });

  it("rejects requests without the cookie", () => {
    expect(
      verifyTurnstileVerification(
        new Request("http://localhost/api/auth/signin/google"),
        now,
      ),
    ).toBe(false);
  });

  it("builds an HttpOnly, SameSite=Lax cookie with the right TTL", () => {
    const cookie = turnstileVerifiedCookie(true, now);
    expect(cookie).toContain(`${TURNSTILE_VERIFIED_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=600");
  });

  it("omits Secure when not on https", () => {
    expect(turnstileVerifiedCookie(false, now)).not.toContain("Secure");
  });

  it("throws in production when no secret is configured", () => {
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.AUTH_SECRET;
    process.env.NODE_ENV = "production";

    expect(() => createTurnstileVerifiedValue(now)).toThrow(
      /NEXTAUTH_SECRET.*required in production/,
    );
  });
});
