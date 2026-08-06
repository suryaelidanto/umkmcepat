// Matches Auth.js session cookies (authjs.session-token, and the
// __Secure-authjs.session-token variant behind TLS terminators).
const AUTH_COOKIE_PATTERN = /(?:^|;\s*)[^;=]*session-token=/i;
const LANDING_PATHS = new Set(["/", "/privacy", "/terms", "/support"]);
const LANDING_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

export function shouldCacheLandingResponse(
  request: Request,
  response: Response,
): boolean {
  if (request.method !== "GET") {
    return false;
  }
  const url = new URL(request.url);
  if (!LANDING_PATHS.has(url.pathname)) {
    return false;
  }
  if (response.status !== 200) {
    return false;
  }
  if (AUTH_COOKIE_PATTERN.test(request.headers.get("cookie") ?? "")) {
    return false;
  }
  return true;
}

export function applyLandingCacheHeaders(
  request: Request,
  response: Response,
): void {
  if (!shouldCacheLandingResponse(request, response)) {
    return;
  }
  const vary = response.headers.get("Vary");
  response.headers.set("Vary", vary ? `${vary}, cookie` : "cookie");
  response.headers.set("Cache-Control", LANDING_CACHE_CONTROL);
}
