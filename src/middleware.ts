import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/rate-limit";

import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const rateLimitResponse = await checkRateLimit(request, "global");

    if (rateLimitResponse) {
      return rateLimitResponse;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
