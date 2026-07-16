import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { AnalysisReport } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/report?id=...  -> full report for an analysis
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const row = await db.analysis.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  let report: AnalysisReport | null = null;
  try {
    report = JSON.parse(row.report) as AnalysisReport;
  } catch {
    report = null;
  }

  return NextResponse.json({
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
  });
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
