import {
  createCsrfMiddleware,
  createStart,
  createMiddleware,
} from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { getAuthStore } from "@/lib/auth/auth";
import { primeSettingCache } from "@/lib/config/app-settings";
import { generateNonce, getNonceStore } from "@/lib/csp-nonce";
import { applyLandingCacheHeaders } from "@/lib/landing-cache";
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

const securityMiddleware = createMiddleware().server(async ({ next }) => {
  await primeSettingCache();

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

  const result = await getAuthStore().run(new Map(), async () => {
    return await getNonceStore().run(nonce, async () => {
      return await next();
    });
  });
  // Handle immutable headers from auth runtime safely
  let responseHeaders: Headers;
  try {
    result.response.headers.set("x-immutability-probe", "1");
    result.response.headers.delete("x-immutability-probe");
    responseHeaders = result.response.headers;
  } catch {
    responseHeaders = new Headers(result.response.headers);
  }
  applySecurityHeaders(responseHeaders, {
    generatedOrigin,
    pathname,
    nonce,
  });
  let finalResponse = result.response;
  if (responseHeaders !== result.response.headers) {
    finalResponse = new Response(result.response.body, {
      status: result.response.status,
      statusText: result.response.statusText,
      headers: responseHeaders,
    });
  }
  applyLandingCacheHeaders(request, finalResponse);

  return { ...result, response: finalResponse };
});

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [csrfMiddleware, securityMiddleware],
  };
});
