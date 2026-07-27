import {
  createCsrfMiddleware,
  createStart,
  createMiddleware,
} from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { generateNonce, getNonceStore } from "@/lib/csp-nonce";
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
  const nonce = generateNonce();
  const request = getRequest();
  const url = new URL(request.url);
  const pathname = url.pathname;
  const generatedOrigin = isGeneratedOrigin(url.origin);
  const isApi = pathname.startsWith("/api/");

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto =
    forwardedProto === "https" || forwardedProto === "http"
      ? forwardedProto
      : url.protocol.replace(":", "");
  const requestOrigin = `${proto}://${url.host}`;

  if (
    isApi &&
    isCrossSiteMutation({
      fetchSite: request.headers.get("sec-fetch-site"),
      method: request.method,
      origin: request.headers.get("origin"),
      pathname,
      requestOrigin,
    })
  ) {
    const blocked = Response.json(
      { code: "cross_site_request_blocked", message: "Permintaan ditolak." },
      { status: 403 },
    );
    applySecurityHeaders(blocked.headers, { generatedOrigin, pathname, nonce });
    return blocked;
  }

  if (isApi) {
    const rateLimitResponse = await checkRateLimit(request, "global");

    if (rateLimitResponse) {
      applySecurityHeaders(rateLimitResponse.headers, {
        generatedOrigin,
        pathname,
        nonce,
      });
      return rateLimitResponse;
    }
  }

  const result = await getNonceStore().run(nonce, async () => {
    return await next();
  });
  applySecurityHeaders(result.response.headers, {
    generatedOrigin,
    pathname,
    nonce,
  });

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
    requestMiddleware: [csrfMiddleware, securityMiddleware],
  };
});
