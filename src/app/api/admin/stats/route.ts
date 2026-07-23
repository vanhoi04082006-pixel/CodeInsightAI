// GET /api/admin/stats — Overview stats for admin dashboard.
// Returns: totals (users, analyses, chatMessages, proUsers, teamUsers,
// activeSubs, mrr, providers), recentSignups, topUsers, providerUsage,
// trends (analyses/users/chats, 30 days).
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

    const [
      totalUsers,
      totalAnalyses,
      totalChatMessages,
      proUsers,
      teamUsers,
      enterpriseUsers,
      totalProviders,
      totalCredentials,
      recentSignups,
      recentAnalyses,
      recentChats,
      recentUsers,
      providerUsageRaw,
      recentAnalysisRows,
    ] = await Promise.all([
      db.user.count(),
      db.analysis.count(),
      db.chatMessage.count(),
      db.user.count({ where: { plan: "pro" } }),
      db.user.count({ where: { plan: "team" } }),
      db.user.count({ where: { plan: "enterprise" } }),
      db.platformAIConfig.count({ where: { enabled: true } }),
      db.providerCredential.count({ where: { enabled: true } }),
      db.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { id: true, name: true, email: true, image: true, plan: true, createdAt: true },
      }),
      db.analysis.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true, userId: true },
      }),
      db.chatMessage.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true },
      }),
      db.user.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true },
      }),
      db.providerCredential.groupBy({
        by: ["providerId"],
        _count: { providerId: true },
        orderBy: { _count: { providerId: "desc" } },
      }),
      db.analysis.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true, userId: true, repoOwner: true, repoName: true, overallScore: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    // Trends (30 days, bucketed by day)
    const analysesTrend = bucketByDay(recentAnalyses.map((a) => a.createdAt));
    const chatsTrend = bucketByDay(recentChats.map((c) => c.createdAt));
    const usersTrend = bucketByDay(recentUsers.map((u) => u.createdAt));

    // Previous period (30-60 days ago) for delta calculation
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const [prevAnalyses, prevUsers, prevChats] = await Promise.all([
      db.analysis.count({ where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
      db.user.count({ where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
      db.chatMessage.count({ where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    ]);

    const currAnalysesCount = recentAnalyses.length;
    const currUsersCount = recentUsers.length;
    const currChatsCount = recentChats.length;

    // Top users by analysis count (last 30 days)
    const userAnalysisCount = new Map<string, number>();
    recentAnalyses.forEach((a) => {
      if (a.userId) {
        userAnalysisCount.set(a.userId, (userAnalysisCount.get(a.userId) ?? 0) + 1);
      }
    });
    const topUserIds = Array.from(userAnalysisCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id]) => id);

    const topUsers = topUserIds.length
      ? await db.user.findMany({
          where: { id: { in: topUserIds } },
          select: { id: true, name: true, email: true, image: true, plan: true },
        })
      : [];

    const topUsersWithCount = topUsers
      .map((u) => ({
        ...u,
        analysisCount: userAnalysisCount.get(u.id) ?? 0,
      }))
      .sort((a, b) => b.analysisCount - a.analysisCount);

    // MRR (rough estimate: $9 * pro + $29 * team)
    const mrr = proUsers * 9 + teamUsers * 29;

    // Recent analyses with user info
    const recentAnalysesWithUser = recentAnalysisRows.length
      ? await Promise.all(
          recentAnalysisRows.map(async (a) => {
            const user = a.userId
              ? await db.user.findUnique({
                  where: { id: a.userId },
                  select: { name: true, email: true, image: true },
                })
              : null;
            return {
              id: (a as any).id,
              repoOwner: a.repoOwner,
              repoName: a.repoName,
              overallScore: a.overallScore,
              createdAt: a.createdAt,
              user,
            };
          })
        )
      : [];

    // Provider usage with preset names
    const providerUsage = providerUsageRaw.map((p) => ({
      providerId: p.providerId,
      count: p._count.providerId,
    }));

    return NextResponse.json({
      totals: {
        users: totalUsers,
        analyses: totalAnalyses,
        chatMessages: totalChatMessages,
        proUsers,
        teamUsers,
        enterpriseUsers,
        activeSubs: proUsers + teamUsers + enterpriseUsers,
        mrr,
        providers: totalProviders,
        credentials: totalCredentials,
      },
      deltas: {
        analyses: calcDelta(currAnalysesCount, prevAnalyses),
        users: calcDelta(currUsersCount, prevUsers),
        chats: calcDelta(currChatsCount, prevChats),
      },
      recentSignups,
      topUsers: topUsersWithCount,
      providerUsage,
      recentAnalyses: recentAnalysesWithUser,
      trends: {
        analyses: analysesTrend,
        users: usersTrend,
        chats: chatsTrend,
      },
    });
  } catch (e) {
    console.error("[/api/admin/stats]", e);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}

function bucketByDay(dates: Date[]): { date: string; count: number }[] {
  const map = new Map<string, number>();
  // Fill all 30 days (including zeros) for continuous chart
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    map.set(d.toISOString().slice(0, 10), 0);
  }
  for (const d of dates) {
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
    if (map.has(key)) {
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function calcDelta(curr: number, prev: number): { value: number; percent: number } {
  if (prev === 0) return { value: curr, percent: curr > 0 ? 100 : 0 };
  const diff = curr - prev;
  const percent = Math.round((diff / prev) * 100);
  return { value: diff, percent };
}
