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
  }: {
    generatedOrigin: boolean;
    pathname: string;
  },
) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (generatedOrigin) {
    headers.set(
      "Content-Security-Policy",
      "object-src 'none'; base-uri 'none'",
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
    headers.set("X-Frame-Options", "SAMEORIGIN");
  } else {
    headers.set(
      "Content-Security-Policy",
      "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    );
    headers.set("X-Frame-Options", "DENY");
  }

  return headers;
}
