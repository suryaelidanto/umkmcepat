import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/rate-limit";
import {
  applySecurityHeaders,
  isCrossSiteMutation,
} from "@/lib/security-headers";

import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const generatedOrigin = isGeneratedOrigin(request);

  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    isCrossSiteMutation({
      fetchSite: request.headers.get("sec-fetch-site"),
      method: request.method,
      origin: request.headers.get("origin"),
      pathname: request.nextUrl.pathname,
      requestOrigin: request.nextUrl.origin,
    })
  ) {
    const response = NextResponse.json(
      { code: "cross_site_request_blocked", message: "Permintaan ditolak." },
      { status: 403 },
    );
    applySecurityHeaders(response.headers, {
      generatedOrigin,
      pathname: request.nextUrl.pathname,
    });
    return response;
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    const rateLimitResponse = await checkRateLimit(request, "global");

    if (rateLimitResponse) {
      applySecurityHeaders(rateLimitResponse.headers, {
        generatedOrigin,
        pathname: request.nextUrl.pathname,
      });
      return rateLimitResponse;
    }
  }

  const response = NextResponse.next();
  applySecurityHeaders(response.headers, {
    generatedOrigin,
    pathname: request.nextUrl.pathname,
  });
  return response;
}

function isGeneratedOrigin(request: NextRequest) {
  const configured = process.env.GENERATED_PUBLIC_ORIGIN;

  if (!configured) {
    return false;
  }

  try {
    return new URL(configured).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
