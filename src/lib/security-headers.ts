export function isCrossSiteMutation({
  fetchSite,
  method,
  origin,
  pathname,
  requestOrigin,
}: {
  fetchSite: string | null;
  method: string;
  origin: string | null;
  pathname: string;
  requestOrigin: string;
}) {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
    return false;
  }

  if (
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/payment/webhook"
  ) {
    return false;
  }

  if (origin) {
    try {
      if (new URL(origin).origin !== requestOrigin) {
        return true;
      }
    } catch {
      return true;
    }
  }

  return fetchSite === "cross-site";
}

export function applySecurityHeaders(
  headers: Headers,
  {
    generatedOrigin,
    pathname,
    nonce,
  }: {
    generatedOrigin: boolean;
    pathname: string;
    nonce?: string;
  },
) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  const nonceStr = nonce || "";

  if (generatedOrigin) {
    headers.set(
      "Content-Security-Policy",
      "object-src 'none'; base-uri 'none'",
    );
    headers.set(
      "Content-Security-Policy-Report-Only",
      "script-src 'nonce-" +
        nonceStr +
        "' 'strict-dynamic' https: 'unsafe-inline'; report-uri /api/csp-violation",
    );
    headers.delete("X-Frame-Options");
    return headers;
  }

  const privatePreview =
    /^\/api\/projects\/[^/]+\/(?:preview|assets)(?:\/|$)/.test(pathname);

  if (privatePreview) {
    headers.set(
      "Content-Security-Policy",
      "sandbox allow-scripts; frame-ancestors 'self'; object-src 'none'; base-uri 'none'",
    );
    headers.set(
      "Content-Security-Policy-Report-Only",
      "script-src 'nonce-" +
        nonceStr +
        "' 'strict-dynamic' https: 'unsafe-inline'; report-uri /api/csp-violation",
    );
    headers.set("X-Frame-Options", "SAMEORIGIN");
  } else {
    headers.set(
      "Content-Security-Policy",
      "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; script-src 'nonce-" +
        nonceStr +
        "' 'strict-dynamic' https: 'unsafe-inline'; report-uri /api/csp-violation",
    );
    headers.set("X-Frame-Options", "DENY");

    if (headers.get("Content-Type")?.includes("text/html")) {
      headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    }
  }

  return headers;
}
