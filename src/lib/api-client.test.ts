import { describe, expect, it } from "vitest";

import { apiNetworkError, parseApiResponse } from "./api-client";

describe("parseApiResponse", () => {
  it("parses JSON success", async () => {
    const result = await parseApiResponse<{ path: string }>(
      Response.json({ path: "/projects/1" }),
    );

    expect(result).toMatchObject({ ok: true, data: { path: "/projects/1" } });
  });

  it("parses JSON error", async () => {
    const result = await parseApiResponse(
      Response.json(
        { code: "rate_limited", message: "Tunggu dulu." },
        { status: 429 },
      ),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "rate_limited", message: "Tunggu dulu." },
    });
  });

  it("handles empty error bodies", async () => {
    const result = await parseApiResponse(new Response("", { status: 500 }));

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "http_500",
        message: "Permintaan belum bisa diproses. Coba lagi nanti.",
      },
    });
  });

  it("handles non-JSON error bodies", async () => {
    const result = await parseApiResponse(
      new Response("<html>error</html>", { status: 502 }),
    );

    expect(result).toMatchObject({ ok: false, error: { code: "http_502" } });
  });

  it("handles network failures", () => {
    expect(apiNetworkError(new TypeError("fetch failed"))).toMatchObject({
      ok: false,
      error: { code: "network_error" },
    });
  });
});
