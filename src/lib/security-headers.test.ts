import { describe, expect, it } from "vitest";

import {
  applySecurityHeaders,
  isCrossSiteMutation,
} from "@/lib/security-headers";

describe("mutation origin policy", () => {
  it("rejects cross-site product mutations without blocking auth callbacks or reads", () => {
    expect(
      isCrossSiteMutation({
        fetchSite: "cross-site",
        method: "POST",
        origin: "https://evil.example",
        pathname: "/api/projects/project_1/publish",
        requestOrigin: "https://app.example.com",
      }),
    ).toBe(true);
    expect(
      isCrossSiteMutation({
        fetchSite: "same-origin",
        method: "POST",
        origin: "https://app.example.com",
        pathname: "/api/projects/project_1/publish",
        requestOrigin: "https://app.example.com",
      }),
    ).toBe(false);
    expect(
      isCrossSiteMutation({
        fetchSite: "cross-site",
        method: "GET",
        origin: null,
        pathname: "/api/projects",
        requestOrigin: "https://app.example.com",
      }),
    ).toBe(false);
    expect(
      isCrossSiteMutation({
        fetchSite: "cross-site",
        method: "POST",
        origin: "https://accounts.google.com",
        pathname: "/api/auth/callback/google",
        requestOrigin: "https://app.example.com",
      }),
    ).toBe(false);
    expect(
      isCrossSiteMutation({
        fetchSite: "cross-site",
        method: "POST",
        origin: "https://some-other-origin.com",
        pathname: "/api/csp-violation",
        requestOrigin: "https://app.example.com",
      }),
    ).toBe(false);
  });
});

describe("security headers", () => {
  it("denies framing and sensitive browser capabilities on the control plane", () => {
    const headers = applySecurityHeaders(new Headers(), {
      generatedOrigin: false,
      pathname: "/projects/project_1",
      nonce: "testnonce123",
    });

    expect(headers.get("Content-Security-Policy")).toBe(
      "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; script-src 'nonce-testnonce123' 'strict-dynamic' https: 'unsafe-inline'; report-uri /api/csp-violation",
    );
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });

  it("allows only same-origin framing for private preview routes", () => {
    const headers = applySecurityHeaders(new Headers(), {
      generatedOrigin: false,
      pathname: "/api/projects/project_1/preview/index.html",
      nonce: "testnonce123",
    });

    expect(headers.get("Content-Security-Policy")).toBe(
      "sandbox allow-scripts; frame-ancestors 'self'; object-src 'none'; base-uri 'none'",
    );
    expect(headers.get("Content-Security-Policy-Report-Only")).toBe(
      "script-src 'nonce-testnonce123' 'strict-dynamic' https: 'unsafe-inline'; report-uri /api/csp-violation",
    );
    expect(headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });

  it("does not apply authenticated control-plane framing policy on the generated host", () => {
    const headers = applySecurityHeaders(new Headers(), {
      generatedOrigin: true,
      pathname: "/p/warung",
      nonce: "testnonce123",
    });

    expect(headers.get("X-Frame-Options")).toBeNull();
    expect(headers.get("Content-Security-Policy")).toBe(
      "object-src 'none'; base-uri 'none'",
    );
    expect(headers.get("Content-Security-Policy-Report-Only")).toBe(
      "script-src 'nonce-testnonce123' 'strict-dynamic' https: 'unsafe-inline'; report-uri /api/csp-violation",
    );
  });
});
