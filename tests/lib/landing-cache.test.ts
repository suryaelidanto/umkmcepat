import { describe, expect, it } from "vitest";

import { applyLandingCacheHeaders } from "@/lib/landing-cache";

function request(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("applyLandingCacheHeaders", () => {
  it("caches a GET / without cookies", () => {
    const response = new Response("<html>", { status: 200 });
    applyLandingCacheHeaders(request("http://localhost:3000/"), response);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=300",
    );
    expect(response.headers.get("Vary")).toBe("cookie");
  });

  it("skips requests with an authjs session-token cookie", () => {
    const response = new Response("<html>", { status: 200 });
    applyLandingCacheHeaders(
      request("http://localhost:3000/", {
        headers: { cookie: "authjs.session-token=abc; foo=1" },
      }),
      response,
    );
    expect(response.headers.get("Cache-Control")).toBeNull();
  });

  it("skips non-landing paths and non-GET methods", () => {
    const response = new Response("<html>", { status: 200 });
    applyLandingCacheHeaders(
      request("http://localhost:3000/projects/abc"),
      response,
    );
    expect(response.headers.get("Cache-Control")).toBeNull();

    applyLandingCacheHeaders(
      request("http://localhost:3000/", { method: "POST" }),
      response,
    );
    expect(response.headers.get("Cache-Control")).toBeNull();
  });

  it("appends to an existing Vary header", () => {
    const response = new Response("<html>", {
      status: 200,
      headers: { Vary: "accept" },
    });
    applyLandingCacheHeaders(request("http://localhost:3000/"), response);
    expect(response.headers.get("Vary")).toBe("accept, cookie");
  });
});
