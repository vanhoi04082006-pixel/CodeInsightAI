// CodeInsight AI — Global API rate limiting middleware
//
// Protects all /api/* routes from abuse. Uses in-memory token bucket per IP.
// Limits: 60 requests/minute per IP (general), 10/minute for auth + billing.
//
// In production on Vercel, each serverless instance has its own memory,
// so this is per-instance limiting. For true distributed rate limiting,
// use Upstash Redis (but in-memory is sufficient for most use cases).

import { NextRequest, NextResponse } from "next/server";
import { RateLimiterRegistry } from "@/lib/production/rate-limiter";

// Initialize rate limiter registry
const registry = new RateLimiterRegistry();

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Only rate-limit API routes
  if (!path.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Skip health check (no rate limit)
  if (path === "/api/health") {
    return NextResponse.next();
  }

  // Get client IP (from Vercel headers or fallback)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";

  // Choose limiter based on route
  let limiterName: "default" | "auth" | "billing" | "analyze" = "default";

  if (path.startsWith("/api/auth/") || path.startsWith("/api/auth/signin")) {
    limiterName = "auth";
  } else if (path.startsWith("/api/billing/")) {
    limiterName = "billing";
  } else if (path.startsWith("/api/analyze") || path.startsWith("/api/chat")) {
    limiterName = "analyze";
  }

  const limiter = registry.get(limiterName);
  if (!limiter.allow(ip)) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded. Please slow down and try again in a moment.",
        retryAfter: 60,
      },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "X-RateLimit-Limit": limiterName === "auth" ? "10" : "60",
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
