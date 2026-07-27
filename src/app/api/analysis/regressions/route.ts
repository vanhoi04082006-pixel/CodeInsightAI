// GET /api/analysis/regressions?analysisId=<id>
//
// Phase 2 (P2.2 + P2.4) — "What changed since last scan" endpoint.
// Auto-picks the previous analysis for the same repo (latest-but-one before
// the given analysisId's createdAt), computes a raw diff (P2.2), then runs
// the classifier (P2.4) to produce a RegressionReport — verdict +
// regressions[] + improvements[] + headline.
//
// Used by the "What changed" banner in OverviewTab — renders only when a
// previous analysis exists.
//
// Auth: ownership-checks BOTH the current and the previous analysis.
// Select only `report` + `createdAt` for the diff — `parsedData` is excluded.
//
// Response shape:
//   - No previous analysis: { previousAnalysis: null }
//   - Previous exists:      RegressionReport (classified)

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { diffAnalyses } from "@/lib/analysis-diff";
import { classifyRegressions } from "@/lib/regression-detector";
import type { AnalysisReport } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

function iso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const analysisId = searchParams.get("analysisId");
  if (!analysisId) {
    return NextResponse.json(
      { error: "analysisId query parameter required" },
      { status: 400 }
    );
  }

  // Load current analysis (ownership-check)
  const current = await db.analysis.findUnique({
    where: { id: analysisId },
    select: {
      userId: true,
      repoOwner: true,
      repoName: true,
      createdAt: true,
      report: true,
    },
  });
  if (!current || current.userId !== userId) {
    return NextResponse.json(
      { error: "Analysis not found" },
      { status: 404 }
    );
  }

  // Find the most-recent analysis BEFORE this one for the same repo.
  // (createdAt < current.createdAt) ordered desc → take the first.
  const previous = await db.analysis.findFirst({
    where: {
      repoOwner: current.repoOwner,
      repoName: current.repoName,
      userId,
      createdAt: { lt: current.createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, report: true },
  });

  if (!previous) {
    // No prior scan — render the banner's empty state (the UI just hides
    // the banner).
    return NextResponse.json({ previousAnalysis: null });
  }

  // Parse both reports
  let fromReport: AnalysisReport;
  let toReport: AnalysisReport;
  try {
    fromReport = JSON.parse(previous.report) as AnalysisReport;
  } catch {
    return NextResponse.json(
      { error: "Previous analysis report is malformed" },
      { status: 500 }
    );
  }
  try {
    toReport = JSON.parse(current.report) as AnalysisReport;
  } catch {
    return NextResponse.json(
      { error: "Current analysis report is malformed" },
      { status: 500 }
    );
  }

  const diff = diffAnalyses(
    fromReport,
    toReport,
    { analysisId: previous.id, createdAt: iso(previous.createdAt) },
    { analysisId, createdAt: iso(current.createdAt) }
  );

  // Phase 2.4 — classify the raw diff into a RegressionReport (verdict +
  // regressions[] + improvements[] + headline). `classifyRegressions` is a
  // pure function and never throws, so this is safe to call inline.
  const report = classifyRegressions(diff, {
    analysisId: previous.id,
    createdAt: iso(previous.createdAt),
  });

  return NextResponse.json(report);
}
