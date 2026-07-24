// GET /api/usage/tokens — Return token usage for current month
// Returns: { used, limit, remaining, plan, model }
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLAN_LIMITS } from "@/lib/billing/usage";

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
    const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

    // Admin = unlimited
    if (isAdmin) {
      return NextResponse.json({
        plan: "admin",
        used: 0,
        limit: -1, // unlimited
        remaining: -1,
        unlimited: true,
      });
    }

    // Get token usage for this month
    // We estimate tokens from chat messages + analyses
    // (real token tracking would require a TokenUsage table)
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Estimate: 1 chat message ≈ 500 tokens (input + output avg)
    // 1 analysis ≈ 5000 tokens (7-pass deep analysis)
    const [chatCount, analysisCount] = await Promise.all([
      db.chatMessage.count({
        where: {
          createdAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), 1),
          },
        },
      }),
      db.analysis.count({
        where: {
          userId,
          createdAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), 1),
          },
        },
      }),
    ]);

    const estimatedTokens = (chatCount * 500) + (analysisCount * 5000);
    const limit = limits.tokensPerMonth;
    const remaining = limit === -1 ? -1 : Math.max(0, limit - estimatedTokens);

    return NextResponse.json({
      plan,
      used: estimatedTokens,
      limit,
      remaining,
      unlimited: limit === -1,
      breakdown: {
        chatMessages: chatCount,
        analyses: analysisCount,
        estimatedPerChat: 500,
        estimatedPerAnalysis: 5000,
      },
    });
  } catch (e) {
    console.error("[/api/usage/tokens]", e);
    return NextResponse.json({ error: "Failed to load token usage" }, { status: 500 });
  }
}
