// GET /api/usage — Return current usage + limits for the authenticated user
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { getUsage, checkQuota, PLAN_LIMITS } from "@/lib/billing/usage";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const usage = await getUsage(userId);

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { plan: true, trialEndsAt: true },
    });

    const plan = user?.plan ?? "free";
    const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

    // Check all quotas
    const [analysisQuota, chatQuota, agentQuota] = await Promise.all([
      checkQuota(userId, "analysis"),
      checkQuota(userId, "chat"),
      checkQuota(userId, "agent_task"),
    ]);

    return NextResponse.json({
      plan,
      trialEndsAt: user?.trialEndsAt,
      usage: {
        analysis: { used: usage.analysis, limit: limits.analysesPerMonth },
        chat: { used: usage.chat, limit: limits.chatMessagesPerMonth },
        agentTask: { used: usage.agent_task, limit: limits.agentTasksPerMonth },
      },
      limits,
      quotas: {
        analysis: analysisQuota,
        chat: chatQuota,
        agentTask: agentQuota,
      },
    });
  } catch (e) {
    console.error("[/api/usage GET]", e);
    return NextResponse.json({ error: "Failed to load usage" }, { status: 500 });
  }
}
