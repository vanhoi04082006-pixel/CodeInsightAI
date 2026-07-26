// GET /api/analysis/diff?from=<analysisId>&to=<analysisId>
//
// Phase 2 (P2.2) — Analysis diff endpoint.
// Computes a structured diff (score deltas, added/resolved issues, file
// changes, tech-debt delta, AI-finding add/resolve counts) between two
// AnalysisReport snapshots of the same repo.
//
// Auth: ownership-checks BOTH `from` and `to` analyses against requireUserId().
// Select only `report` + `createdAt` columns — never load `parsedData` (can
// be 5MB) since the diff only needs the JSON report blob.
//
// Pure compute (<500ms for typical repos) — no DB caching layer needed.

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { diffAnalyses } from "@/lib/analysis-diff";
import type { AnalysisReport } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fromId = searchParams.get("from");
  const toId = searchParams.get("to");
  if (!fromId || !toId) {
    return NextResponse.json(
      { error: "from and to query parameters required" },
      { status: 400 }
    );
  }
  if (fromId === toId) {
    return NextResponse.json(
      { error: "from and to must be different analyses" },
      { status: 400 }
    );
  }

  // Ownership-check both analyses (multi-tenant — each must belong to userId)
  const [fromAnalysis, toAnalysis] = await Promise.all([
    db.analysis.findUnique({
      where: { id: fromId },
      select: { userId: true, report: true, createdAt: true },
    }),
    db.analysis.findUnique({
      where: { id: toId },
      select: { userId: true, report: true, createdAt: true },
    }),
  ]);

  if (!fromAnalysis || fromAnalysis.userId !== userId) {
    return NextResponse.json(
      { error: "From analysis not found" },
      { status: 404 }
    );
  }
  if (!toAnalysis || toAnalysis.userId !== userId) {
    return NextResponse.json(
      { error: "To analysis not found" },
      { status: 404 }
    );
  }

  // Parse the JSON reports (graceful on malformed JSON)
  let fromReport: AnalysisReport;
  let toReport: AnalysisReport;
  try {
    fromReport = JSON.parse(fromAnalysis.report) as AnalysisReport;
  } catch {
    return NextResponse.json(
      { error: "From analysis report is malformed" },
      { status: 500 }
    );
  }
  try {
    toReport = JSON.parse(toAnalysis.report) as AnalysisReport;
  } catch {
    return NextResponse.json(
      { error: "To analysis report is malformed" },
      { status: 500 }
    );
  }

  // Pure-function diff (no I/O, fully deterministic)
  const diff = diffAnalyses(fromReport, toReport, {
    analysisId: fromId,
    createdAt:
      fromAnalysis.createdAt instanceof Date
        ? fromAnalysis.createdAt.toISOString()
        : String(fromAnalysis.createdAt),
  }, {
    analysisId: toId,
    createdAt:
      toAnalysis.createdAt instanceof Date
        ? toAnalysis.createdAt.toISOString()
        : String(toAnalysis.createdAt),
  });

  return NextResponse.json(diff);
}
