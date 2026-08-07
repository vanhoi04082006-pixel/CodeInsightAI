// CodeInsight AI — Rate limiting proxy (Vercel Edge compatible)
//
// Next.js 16 deprecates "middleware" in favor of "proxy".
// This file replaces src/middleware.ts with the same functionality.
//
// IMPORTANT: This MUST be edge-runtime compatible.
// No `setInterval`, no Node.js APIs, no dynamic imports.
// /api/auth/* is EXCLUDED from matcher to prevent NextAuth errors.

import { NextRequest, NextResponse } from "next/server";

// In-memory token bucket (edge-safe)
interface Bucket { tokens: number; lastRefill: number; }
const buckets = new Map<string, Bucket>();
const LIMITS: Record<string, { capacity: number; refillRate: number }> = {
  default: { capacity: 60, refillRate: 1 },
  analyze: { capacity: 20, refillRate: 0.33 },
  billing: { capacity: 10, refillRate: 0.17 },
};

function allow(ip: string, type: keyof typeof LIMITS): boolean {
  const key = `${ip}:${type}`;
  const limit = LIMITS[type];
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: limit.capacity, lastRefill: now };
    buckets.set(key, bucket);
  }
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(limit.capacity, bucket.tokens + elapsed * limit.refillRate);
  bucket.lastRefill = now;
  if (buckets.size > 500) {
    for (const [k, b] of buckets) {
      if (now - b.lastRefill > 300000) buckets.delete(k);
    }
  }
  if (bucket.tokens >= 1) { bucket.tokens -= 1; return true; }
  return false;
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!path.startsWith("/api/")) return NextResponse.next();
  if (path === "/api/health") return NextResponse.next();

  // Audit fix F1: CSRF protection — check Origin header on state-changing requests
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH" || req.method === "DELETE") {
    // Skip webhook (uses own signature) and auth routes
    if (!path.startsWith("/api/webhook/") && !path.startsWith("/api/billing/webhook") && !path.startsWith("/api/auth/")) {
      const origin = req.headers.get("origin");
      const host = req.headers.get("host");
      if (origin && host) {
        try {
          const originHost = new URL(origin).host;
          if (originHost !== host) {
            return NextResponse.json({ error: "CSRF check failed: Origin mismatch" }, { status: 403 });
          }
        } catch {
          return NextResponse.json({ error: "Invalid Origin header" }, { status: 403 });
        }
      } else {
        // No Origin header — check for session cookie (same-origin fetch)
        const sessionCookie =
          req.cookies.get("__Secure-next-auth.session-token") ||
          req.cookies.get("next-auth.session-token");
        if (!sessionCookie) {
          return NextResponse.json({ error: "CSRF check failed: missing Origin or session" }, { status: 403 });
        }
      }
    }
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip") || "unknown";

  let type: keyof typeof LIMITS = "default";
  if (path.startsWith("/api/billing/")) type = "billing";
  else if (path.startsWith("/api/analyze") || path.startsWith("/api/chat")) type = "analyze";

  if (!allow(ip, type)) {
    return NextResponse.json(
      { error: "Rate limit exceeded.", retryAfter: 60 },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
  return NextResponse.next();
}

// CRITICAL: Exclude /api/auth/* using negative lookahead
export const config = {
  matcher: ["/api/((?!auth).*)"],
};
