// GET /api/admin/stats — Overview stats for admin dashboard.
// Returns: totalUsers, totalAnalyses, totalChatMessages, mrr, activeSubs,
// recentSignups (last 5), analysesTrend (last 30 days).
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
    const [
      totalUsers,
      totalAnalyses,
      totalChatMessages,
      proUsers,
      teamUsers,
      recentSignups,
    ] = await Promise.all([
      db.user.count(),
      db.analysis.count(),
      db.chatMessage.count(),
      db.user.count({ where: { plan: "pro" } }),
      db.user.count({ where: { plan: "team" } }),
      db.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, email: true, image: true, plan: true, createdAt: true },
      }),
    ]);

    // Analyses per day (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentAnalyses = await db.analysis.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    });
    const analysesTrend = bucketByDay(recentAnalyses.map((a) => a.createdAt));

    // New users per day (last 30 days)
    const recentUsers = await db.user.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    });
    const usersTrend = bucketByDay(recentUsers.map((u) => u.createdAt));

    // MRR (rough estimate: $9 * pro count + $29 * team count)
    const mrr = proUsers * 9 + teamUsers * 29;

    return NextResponse.json({
      totals: {
        users: totalUsers,
        analyses: totalAnalyses,
        chatMessages: totalChatMessages,
        proUsers,
        teamUsers,
        activeSubs: proUsers + teamUsers,
        mrr,
      },
      recentSignups,
      trends: {
        analyses: analysesTrend,
        users: usersTrend,
      },
    });
  } catch (e) {
    console.error("[/api/admin/stats]", e);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}

function bucketByDay(dates: Date[]): { date: string; count: number }[] {
  const map = new Map<string, number>();
  for (const d of dates) {
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
