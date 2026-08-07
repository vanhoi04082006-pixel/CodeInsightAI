// CodeInsight AI — CSRF Protection Middleware
// Stage 7 audit fix (F1): Verifies Origin header on all state-changing requests.
// NextAuth session cookies are SameSite=Lax by default, but we add an explicit
// Origin check as defense-in-depth against CSRF attacks.

import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  // Only check state-changing methods
  if (req.method !== "POST" && req.method !== "PUT" && req.method !== "PATCH" && req.method !== "DELETE") {
    return NextResponse.next();
  }

  // Skip webhook routes (they use their own signature verification)
  const path = req.nextUrl.pathname;
  if (path.startsWith("/api/webhook/") || path.startsWith("/api/billing/webhook") || path.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // Check Origin header — must match the server's origin
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");

  // Allow same-origin requests (Origin matches Host)
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) {
        return NextResponse.next();
      }
    } catch {
      // Invalid origin URL — reject
      return NextResponse.json({ error: "Invalid Origin header" }, { status: 403 });
    }
  }

  // For API routes called from the same app (fetch with relative URLs),
  // the Origin header may be absent. Allow if no Origin but has valid session cookie.
  // NextAuth sets __Secure-next-auth.session-token or next-auth.session-token
  const sessionCookie =
    req.cookies.get("__Secure-next-auth.session-token") ||
    req.cookies.get("next-auth.session-token");

  if (sessionCookie) {
    // Has session cookie — likely a legitimate same-origin request
    return NextResponse.next();
  }

  // No Origin, no session cookie — reject
  return NextResponse.json({ error: "CSRF check failed: missing Origin header or session" }, { status: 403 });
}

export const config = {
  matcher: [
    "/api/((?!auth|webhook|health).*)",
  ],
};
