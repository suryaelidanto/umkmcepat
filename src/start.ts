import { sentryGlobalRequestMiddleware } from "@sentry/tanstackstart-react";
import {
  createCsrfMiddleware,
  createStart,
  createMiddleware,
} from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { checkRateLimit } from "@/lib/rate-limit";
import {
  applySecurityHeaders,
  isCrossSiteMutation,
} from "@/lib/security-headers";

function isGeneratedOrigin(requestOrigin: string) {
  const configured = process.env.GENERATED_PUBLIC_ORIGIN;

  if (!configured) {
    return false;
  }

  try {
    return new URL(configured).origin === requestOrigin;
  } catch {
    return false;
  }
}

// Global request middleware — runs before every request (server routes, SSR,
// server functions). Preserves the exact behavior and ordering of the previous
// Next.js middleware: cross-site mutation block, then global rate limit, then
// security headers applied to every response.
const securityMiddleware = createMiddleware().server(async ({ next }) => {
  const request = getRequest();
  const url = new URL(request.url);
  const pathname = url.pathname;
  const generatedOrigin = isGeneratedOrigin(url.origin);
  const isApi = pathname.startsWith("/api/");

  if (
    isApi &&
    isCrossSiteMutation({
      fetchSite: request.headers.get("sec-fetch-site"),
      method: request.method,
      origin: request.headers.get("origin"),
      pathname,
      requestOrigin: url.origin,
    })
  ) {
    const blocked = Response.json(
      { code: "cross_site_request_blocked", message: "Permintaan ditolak." },
      { status: 403 },
    );
    applySecurityHeaders(blocked.headers, { generatedOrigin, pathname });
    return blocked;
  }

  if (isApi) {
    const rateLimitResponse = await checkRateLimit(request, "global");

    if (rateLimitResponse) {
      applySecurityHeaders(rateLimitResponse.headers, {
        generatedOrigin,
        pathname,
      });
      return rateLimitResponse;
    }
  }

  const result = await next();
  applySecurityHeaders(result.response.headers, { generatedOrigin, pathname });

  return result;
});

// CSRF protection for server functions. Our custom securityMiddleware already
// covers /api/* routes via isCrossSiteMutation; this protects same-origin RPC
// server function endpoints (non-/api/ paths) per TanStack Start convention.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [
      sentryGlobalRequestMiddleware,
      csrfMiddleware,
      securityMiddleware,
    ],
  };
});
