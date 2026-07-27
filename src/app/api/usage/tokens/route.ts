// GET /api/usage/tokens — Return REAL token usage for current month (P3.1)
//
// Reads from `TokenUsageRecord` (cached counter incremented on each AI call)
// instead of the old chat/analysis-count estimate. Returns:
//   { plan, used, limit, remaining, exceeded, unlimited, resetsAt, breakdown }
//
// `exceeded: true` signals the UI to show a "budget exceeded — upgrade" banner.
// `unlimited: true` (admin / enterprise) short-circuits to a green badge.
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { getTokenUsage } from "@/lib/billing/token-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { plan: true, role: true },
    });

    const plan = user?.plan ?? "free";
    const isAdmin = user?.role === "admin";

    // Admin = unlimited (auth.ts auto-upgrades admin → enterprise plan, but
    // belt-and-braces: explicit role check too).
    if (isAdmin || plan === "enterprise") {
      return NextResponse.json({
        plan: isAdmin ? "admin" : plan,
        used: 0,
        limit: -1, // unlimited
        remaining: -1,
        exceeded: false,
        unlimited: true,
        resetsAt: new Date(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          1
        ).toISOString(),
      });
    }

    // P3.1: real token usage from the cached counter.
    const status = await getTokenUsage(userId, plan);

    // Optional breakdown for context (best-effort — falls back to 0 if no logs)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [chatCount, analysisCount, callCount] = await Promise.all([
      db.chatMessage.count({
        where: { createdAt: { gte: monthStart } },
      }).catch(() => 0),
      db.analysis.count({
        where: {
          userId,
          createdAt: { gte: monthStart },
        },
      }).catch(() => 0),
      db.aICallLog.count({
        where: {
          userId,
          createdAt: { gte: monthStart },
        },
      }).catch(() => 0),
    ]);

    return NextResponse.json({
      plan,
      used: status.used,
      limit: status.limit,
      remaining: status.remaining,
      exceeded: status.exceeded,
      unlimited: status.unlimited,
      resetsAt: status.resetsAt.toISOString(),
      breakdown: {
        chatMessages: chatCount,
        analyses: analysisCount,
        aiCallCount: callCount,
        // Keep the historical averages for context — but the `used` field is
        // now REAL token counts from AICallLog, not these estimates.
        estimatedPerChat: 500,
        estimatedPerAnalysis: 5000,
      },
    });
  } catch (e) {
    console.error("[/api/usage/tokens]", e);
    return NextResponse.json({ error: "Failed to load token usage" }, { status: 500 });
  }
}
