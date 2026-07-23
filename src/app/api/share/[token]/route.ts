// GET /api/share/[token] — Public, read-only access to a shared analysis.
// No auth required (the token IS the capability). Expires after 7 days.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { AnalysisReport } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    const share = await db.shareToken.findUnique({
      where: { token },
      include: { analysis: true },
    });

    if (!share) {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    }
    if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "Share link has expired" }, { status: 410 });
    }

    const row = share.analysis;
    let report: AnalysisReport | null = null;
    try {
      report = JSON.parse(row.report) as AnalysisReport;
    } catch {
      report = null;
    }

    // Bump access count for analytics
    await db.shareToken.update({
      where: { token },
      data: { accessCount: { increment: 1 } },
    });

    return NextResponse.json({
      analysis: {
        id: row.id,
        repoUrl: row.repoUrl,
        repoOwner: row.repoOwner,
        repoName: row.repoName,
        repoBranch: row.repoBranch,
        status: row.status,
        scores: {
          overall: row.overallScore,
          security: row.securityScore,
          performance: row.performanceScore,
          architecture: row.architectureScore,
          maintainability: row.maintainabilityScore,
          codeQuality: row.codeQualityScore,
        },
        primaryLanguage: row.primaryLanguage,
        totalFiles: row.totalFiles,
        totalLines: row.totalLines,
        languages: safeParse(row.languages, []),
        frameworks: safeParse(row.frameworks, []),
        report,
        createdAt: row.createdAt,
      },
      expiresAt: share.expiresAt,
    });
  } catch (e) {
    console.error("[/api/share/[token] GET]", e);
    return NextResponse.json({ error: "Failed to load shared analysis" }, { status: 500 });
  }
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
