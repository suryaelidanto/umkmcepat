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
  });
});

describe("security headers", () => {
  it("denies framing and sensitive browser capabilities on the control plane", () => {
    const headers = applySecurityHeaders(new Headers(), {
      generatedOrigin: false,
      pathname: "/projects/project_1",
    });

    expect(headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
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
    });

    expect(headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'self'",
    );
    expect(headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });

  it("does not apply authenticated control-plane framing policy on the generated host", () => {
    const headers = applySecurityHeaders(new Headers(), {
      generatedOrigin: true,
      pathname: "/p/warung",
    });

    expect(headers.get("X-Frame-Options")).toBeNull();
    expect(headers.get("Content-Security-Policy")).toBe(
      "object-src 'none'; base-uri 'none'",
    );
  });
});
