import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis"; // Import Upstash Redis client
import { NextResponse } from "next/server";

// Check if Upstash Redis environment variables are set
if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.warn("Upstash Redis environment variables not configured. Rate limiting will be disabled.");
    // Optionally throw an error in production?
    // throw new Error("Missing Upstash Redis configuration for rate limiting.");
}

// Initialize Upstash Redis client only if variables are set
const redisClient = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// Create a Ratelimit instance using Upstash Redis client (if available)
const generalRatelimit = redisClient ? new Ratelimit({
    redis: redisClient,
    limiter: Ratelimit.slidingWindow(10, "10 s"), // 10 requests per 10 seconds
    analytics: true,
    prefix: "@upstash/ratelimit/tokko/general",
}) : null;

const aiActionRatelimit = redisClient ? new Ratelimit({
    redis: redisClient,
    limiter: Ratelimit.slidingWindow(5, "60 s"), // 5 requests per 60 seconds for AI actions
    analytics: true,
    prefix: "@upstash/ratelimit/tokko/ai",
}) : null;

// Helper function to apply rate limiting
export async function checkRateLimit(request: Request, type: 'general' | 'ai' = 'general') {
    // If Redis client or ratelimiter couldn't be initialized, disable rate limiting
    const ratelimit = type === 'ai' ? aiActionRatelimit : generalRatelimit;
    if (!ratelimit) {
        // console.log("Rate limiting is disabled due to missing Redis config.");
        return null; 
    }

    const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1";

    try {
        const { success, limit, remaining, reset } = await ratelimit.limit(ip);

        if (!success) {
            const resetDate = new Date(reset);
            const retryAfter = Math.ceil((resetDate.getTime() - Date.now()) / 1000);
            console.warn(`Rate limit exceeded for IP ${ip} on ${type} limit. Remaining: ${remaining}. Resets in ${retryAfter}s.`);
            return NextResponse.json(
                { message: `Terlalu banyak percobaan. Coba lagi dalam ${retryAfter} detik.` },
                { 
                    status: 429,
                    headers: {
                        'Retry-After': `${retryAfter}`,
                        'X-RateLimit-Limit': limit.toString(),
                        'X-RateLimit-Remaining': remaining.toString(),
                        'X-RateLimit-Reset': reset.toString(),
                    }
                }
            );
        }
        return null; // Success
    } catch (error) {
        console.error("Error checking Upstash rate limit:", error);
        // Fail open in case of Redis error during check
        return null; 
    }
} 