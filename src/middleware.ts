import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkRateLimit } from './lib/rate-limit'; // Import the rate limit checker

export async function middleware(request: NextRequest) {
  // Apply global rate limiting to all API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const rateLimitResponse = await checkRateLimit(request, 'global'); // Use 'global' type
    if (rateLimitResponse) {
      console.log(`Global rate limit hit on path ${request.nextUrl.pathname}`);
      return rateLimitResponse; // Return the 429 response if limit exceeded
    }
  }

  // Continue to the requested route if rate limit not exceeded
  return NextResponse.next()
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: '/api/:path*', // Apply middleware ONLY to API routes
} 