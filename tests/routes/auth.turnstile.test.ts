import { beforeEach, describe, expect, it } from "vitest";

import { getHandler } from "./_handler";

import { Route } from "@/routes/api.auth.turnstile";

const POST = getHandler(Route, "POST");

describe("turnstile verification route", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  it("accepts the local dev check when Turnstile keys are empty", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/turnstile", {
        method: "POST",
        body: JSON.stringify({ token: "dev" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects missing tokens", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";

    const response = await POST(
      new Request("http://localhost/api/auth/turnstile", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
  });
});
