// GET /api/usage/trends — Return analysis trends for the authenticated user
// over the last 30 days: scores over time, languages analyzed, repos analyzed.
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Last 30 days of analyses, ordered oldest → newest
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const analyses = await db.analysis.findMany({
      where: {
        userId,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: {
        id: true,
        repoName: true,
        repoOwner: true,
        overallScore: true,
        securityScore: true,
        performanceScore: true,
        architectureScore: true,
        codeQualityScore: true,
        maintainabilityScore: true,
        totalFiles: true,
        totalLines: true,
        primaryLanguage: true,
        languages: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Build per-day score series (averaged if multiple analyses on same day)
    const dayMap = new Map<
      string,
      {
        date: string;
        scores: { overall: number[]; security: number[]; performance: number[]; architecture: number[] };
        count: number;
      }
    >();

    for (const a of analyses) {
      const dayKey = a.createdAt.toISOString().slice(0, 10); // YYYY-MM-DD
      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, {
          date: dayKey,
          scores: { overall: [], security: [], performance: [], architecture: [] },
          count: 0,
        });
      }
      const entry = dayMap.get(dayKey)!;
      entry.scores.overall.push(a.overallScore);
      entry.scores.security.push(a.securityScore);
      entry.scores.performance.push(a.performanceScore);
      entry.scores.architecture.push(a.architectureScore);
      entry.count += 1;
    }

    const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);

    const trendSeries = Array.from(dayMap.values()).map((d) => ({
      date: d.date,
      overall: avg(d.scores.overall),
      security: avg(d.scores.security),
      performance: avg(d.scores.performance),
      architecture: avg(d.scores.architecture),
      count: d.count,
    }));

    // Language frequency across all analyses
    const langFreq = new Map<string, number>();
    for (const a of analyses) {
      try {
        const langs = JSON.parse(a.languages || "[]") as { name: string }[];
        for (const l of langs) {
          if (l?.name) langFreq.set(l.name, (langFreq.get(l.name) ?? 0) + 1);
        }
      } catch {
        // ignore parse errors
      }
      if (a.primaryLanguage) {
        langFreq.set(a.primaryLanguage, (langFreq.get(a.primaryLanguage) ?? 0) + 1);
      }
    }
    const topLanguages = Array.from(langFreq.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Unique repos analyzed
    const repoSet = new Set<string>();
    for (const a of analyses) {
      repoSet.add(`${a.repoOwner}/${a.repoName}`);
    }

    // Score deltas (first vs last analysis in window)
    let deltas: { overall: number; security: number; performance: number; architecture: number } | null = null;
    if (analyses.length >= 2) {
      const first = analyses[0];
      const last = analyses[analyses.length - 1];
      deltas = {
        overall: last.overallScore - first.overallScore,
        security: last.securityScore - first.securityScore,
        performance: last.performanceScore - first.performanceScore,
        architecture: last.architectureScore - first.architectureScore,
      };
    }

    return NextResponse.json({
      windowDays: 30,
      totalAnalyses: analyses.length,
      uniqueRepos: repoSet.size,
      trendSeries,
      topLanguages,
      deltas,
      // Summary stats
      avgOverall: analyses.length
        ? Math.round(analyses.reduce((sum, a) => sum + a.overallScore, 0) / analyses.length)
        : 0,
      totalFiles: analyses.reduce((sum, a) => sum + a.totalFiles, 0),
      totalLines: analyses.reduce((sum, a) => sum + a.totalLines, 0),
    });
  } catch (e) {
    console.error("[/api/usage/trends GET]", e);
    return NextResponse.json({ error: "Failed to load trends" }, { status: 500 });
  }
}
