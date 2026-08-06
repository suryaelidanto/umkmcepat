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
    pathname === "/api/payment/webhook" ||
    pathname === "/api/csp-violation"
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

  if (fetchSite === "cross-site") {
    return true;
  }

  if (!origin && !fetchSite && pathname.startsWith("/api/")) {
    return true;
  }

  return false;
}

/**
 * Origins are taken from verified code references, not guesses:
 *   api.dicebear.com   — avatars, src/lib/profile.ts:9
 *   api.qrserver.com   — payment QR, EnergyBoosterModal.tsx:159
 *   avatars.githubusercontent.com — GitHub contributor avatars, CommunitySection.tsx
 *   challenges.cloudflare.com — Turnstile widget
 * S3_PUBLIC_BASE_URL and the Umami host are environment-dependent, so the
 * policy is assembled at runtime rather than declared as a constant.
 */
export function buildContentSecurityPolicy(nonce: string) {
  const mediaOrigin = originOf(process.env.S3_PUBLIC_BASE_URL);
  const umamiOrigin = originOf(process.env.NEXT_PUBLIC_UMAMI_SCRIPT_SRC);

  const img = [
    "'self'",
    "data:",
    "blob:",
    "https://api.dicebear.com",
    "https://api.qrserver.com",
    "https://avatars.githubusercontent.com",
    mediaOrigin,
  ].filter(Boolean);

  const script = [
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "https:",
    "'unsafe-inline'",
    umamiOrigin,
  ].filter(Boolean);

  const connect = ["'self'", umamiOrigin].filter(Boolean);

  return [
    "default-src 'self'",
    `img-src ${img.join(" ")}`,
    `script-src ${script.join(" ")}`,
    `connect-src ${connect.join(" ")}`,
    // Tailwind injects inline styles; a nonce cannot cover them.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    // Workspace embeds the preview iframe under /api/projects/<id>/preview/,
    // and Turnstile under https://challenges.cloudflare.com. 'self' covers
    // same-origin framing; anything cross-origin (Turnstile) needs an explicit
    // allowlist entry.
    "frame-src 'self' https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "report-uri /api/csp-violation",
  ].join("; ");
}

function originOf(value: string | undefined) {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
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
  const publicPreview = /^\/p\//.test(pathname);

  if (generatedOrigin || publicPreview) {
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

  // Control plane only. The generated-project origin returned above: we do not
  // control its subdomains and must not pin them. `preload` is deliberately
  // omitted until the domain is confirmed stable on HTTPS — it is effectively
  // irreversible once submitted.
  headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains",
  );

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
      buildContentSecurityPolicy(nonceStr),
    );
    headers.set("X-Frame-Options", "DENY");

    if (headers.get("Content-Type")?.includes("text/html")) {
      headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    }
  }

  return headers;
}
