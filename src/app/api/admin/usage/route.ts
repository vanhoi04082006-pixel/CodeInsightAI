// GET /api/admin/usage — Usage analytics for admin dashboard.
// Returns: usageByDay (analyses/chat/agentTasks per day for last 30 days),
// topUsers (by total usage), providerUsage breakdown.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [recentAnalyses, recentChats, recentUsage] = await Promise.all([
      db.analysis.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true, userId: true },
      }),
      db.chatMessage.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true },
      }),
      db.usageRecord.findMany({
        where: { month: { gte: getCurrentMonth() } },
        select: { userId: true, type: true, count: true },
      }),
    ]);

    // Usage by day
    const analysesByDay = bucketByDay(recentAnalyses.map((a) => a.createdAt));
    const chatsByDay = bucketByDay(recentChats.map((c) => c.createdAt));

    // Top users by analysis count
    const userAnalysisCount = new Map<string, number>();
    recentAnalyses.forEach((a) => {
      if (a.userId) {
        userAnalysisCount.set(a.userId, (userAnalysisCount.get(a.userId) ?? 0) + 1);
      }
    });
    const topUserIds = Array.from(userAnalysisCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);

    const topUsers = topUserIds.length
      ? await db.user.findMany({
          where: { id: { in: topUserIds } },
          select: { id: true, name: true, email: true, image: true },
        })
      : [];

    const topUsersWithCount = topUsers.map((u) => ({
      ...u,
      analysisCount: userAnalysisCount.get(u.id) ?? 0,
    })).sort((a, b) => b.analysisCount - a.analysisCount);

    // Provider usage breakdown (count of credentials by providerId)
    const providerUsage = await db.providerCredential.groupBy({
      by: ["providerId"],
      _count: { providerId: true },
      orderBy: { _count: { providerId: "desc" } },
    });

    return NextResponse.json({
      trends: {
        analyses: analysesByDay,
        chats: chatsByDay,
      },
      topUsers: topUsersWithCount,
      providerUsage: providerUsage.map((p) => ({
        providerId: p.providerId,
        count: p._count.providerId,
      })),
    });
  } catch (e) {
    console.error("[/api/admin/usage]", e);
    return NextResponse.json({ error: "Failed to load usage" }, { status: 500 });
  }
}

function bucketByDay(dates: Date[]): { date: string; count: number }[] {
  const map = new Map<string, number>();
  for (const d of dates) {
    const key = d.toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
