import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("denies framing and sensitive browser capabilities on the control plane", () => {
    const headers = applySecurityHeaders(new Headers(), {
      generatedOrigin: false,
      pathname: "/projects/project_1",
      nonce: "testnonce123",
    });

    const policy = headers.get("Content-Security-Policy");
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("script-src 'nonce-testnonce123'");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("report-uri /api/csp-violation");
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
      "sandbox allow-scripts allow-same-origin; frame-ancestors 'self'; object-src 'none'; base-uri 'none'",
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

  it("applies the relaxed generated host policy on public preview paths served on the main domain", () => {
    const headers = applySecurityHeaders(new Headers(), {
      generatedOrigin: false,
      pathname: "/p/warung/index.html",
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

  it("sets HSTS on control-plane responses", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, {
      generatedOrigin: false,
      pathname: "/dashboard",
      nonce: "test-nonce",
    });

    expect(headers.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains",
    );
  });

  it("does not set HSTS on the generated-project origin", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, {
      generatedOrigin: true,
      pathname: "/",
      nonce: "test-nonce",
    });

    // We do not control generated subdomains and must not pin them.
    expect(headers.get("Strict-Transport-Security")).toBeNull();
  });

  it("builds a CSP covering every fetch directive", () => {
    vi.stubEnv("S3_PUBLIC_BASE_URL", "https://media.example.test");
    vi.stubEnv(
      "NEXT_PUBLIC_UMAMI_SCRIPT_SRC",
      "https://umami.example.test/script.js",
    );

    const policy = buildContentSecurityPolicy("test-nonce");

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("https://api.dicebear.com");
    expect(policy).toContain("https://api.qrserver.com");
    expect(policy).toContain("https://media.example.test");
    expect(policy).toContain("https://challenges.cloudflare.com");
    expect(policy).toContain("https://umami.example.test");
    // Workspace preview iframe is same-origin ('self') and Turnstile is the
    // only cross-origin frame we allow. Without 'self' the preview is
    // blocked by parent's frame-src.
    expect(policy).toContain(
      "frame-src 'self' https://challenges.cloudflare.com",
    );
    expect(policy).toContain("'nonce-test-nonce'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it("omits environment origins that are not configured", () => {
    vi.stubEnv("S3_PUBLIC_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_UMAMI_SCRIPT_SRC", "");

    const policy = buildContentSecurityPolicy("test-nonce");

    expect(policy).toContain("default-src 'self'");
    expect(policy).not.toContain("undefined");
    expect(policy).not.toContain("  ");
  });

  it("enforces the full CSP on control-plane responses", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, {
      generatedOrigin: false,
      pathname: "/dashboard",
      nonce: "test-nonce",
    });

    const policy = headers.get("Content-Security-Policy");
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(headers.get("Content-Security-Policy-Report-Only")).toBeNull();
  });
});
