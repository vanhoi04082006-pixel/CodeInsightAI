// GET /api/analysis/refactor-roadmap?analysisId=<id>
//
// Phase 2 (P2.5, capstone) — Sequenced refactor roadmap.
//
// Loads an analysis's AI priorities (P2.3 enhanced) + symbol-level code graph
// (P2.1) + underlying static-analysis issues, then calls the pure
// `buildRefactorRoadmap()` to produce a graph-validated phase ordering:
//   Phase 0 (Critical) → Phase 1 (High) → Phase 2 (Medium) → Phase 3 (Backlog)
//
// Each phase lists the issues fixed in it, with:
//   - effortHours (from the AI's estimate, default 4h)
//   - graphValidatedDeps (real calls/uses/imports edges into this file)
//   - aiClaimedDeps (the AI's dependsOn — marked medium-confidence when the
//     graph doesn't validate them)
//   - unblocks (titles of other priorities this fix enables)
//   - confidence (high/medium/low)
//   - canParallelize (true iff no intra-phase deps)
//
// Auth: ownership-checks the analysis. Selects `report` + `parsedData` (the
// latter only when we need to rebuild the graph on legacy analyses without a
// CodeGraphSnapshot row).
//
// Response: RefactorRoadmap JSON (pure function output — never throws).

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildRefactorRoadmap } from "@/lib/refactor-roadmap";
import { buildCodeGraph } from "@/lib/codegraph/builder";
import type { CodeGraph } from "@/lib/codegraph/builder";
import type { EnhancedPriority, Issue } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const analysisId = searchParams.get("analysisId");
  if (!analysisId) {
    return NextResponse.json(
      { error: "analysisId query parameter required" },
      { status: 400 },
    );
  }

  // Ownership check + load report (parsedData only used as graph fallback).
  const analysis = await db.analysis.findUnique({
    where: { id: analysisId },
    select: { userId: true, report: true, parsedData: true },
  });
  if (!analysis || analysis.userId !== userId) {
    return NextResponse.json(
      { error: "Analysis not found" },
      { status: 404 },
    );
  }

  // Parse the report JSON — guard against malformed rows.
  let report: any;
  try {
    report = JSON.parse(analysis.report);
  } catch {
    return NextResponse.json(
      { error: "Analysis report is malformed" },
      { status: 500 },
    );
  }

  const deep = report?.deepAnalysis;
  const priorities: EnhancedPriority[] = Array.isArray(deep?.priorities)
    ? deep.priorities
    : [];

  if (priorities.length === 0) {
    return NextResponse.json(
      {
        error: "No AI priorities found. Run AI analysis first.",
      },
      { status: 400 },
    );
  }

  // Load or rebuild the symbol graph.
  // (1) Persisted snapshot from P2.1 — preferred.
  // (2) Fallback: rebuild from parsedData for legacy analyses without a
  //     snapshot (mirrors /api/codegraph/[analysisId]/route.ts behavior).
  let graph: CodeGraph | null = null;

  try {
    const snapshot = await db.codeGraphSnapshot.findUnique({
      where: { analysisId },
    });
    if (snapshot) {
      graph = JSON.parse(snapshot.graph) as CodeGraph;
    }
  } catch {
    /* ignore — fall back to rebuild */
  }

  if (!graph) {
    try {
      const parsedData = analysis.parsedData
        ? JSON.parse(analysis.parsedData)
        : null;
      if (parsedData?.files) {
        graph = buildCodeGraph(parsedData);
      }
    } catch {
      /* ignore — graph stays null */
    }
  }

  if (!graph) {
    return NextResponse.json(
      { error: "No graph data available" },
      { status: 400 },
    );
  }

  // Collect all static-analysis issues across the three buckets.
  const issues: Issue[] = [
    ...((report?.issues?.security as Issue[]) || []),
    ...((report?.issues?.bugs as Issue[]) || []),
    ...((report?.issues?.performance as Issue[]) || []),
  ];

  // Pure function — never throws (top-level try/catch returns empty + warning).
  const roadmap = buildRefactorRoadmap(priorities, graph, issues);
  return NextResponse.json(roadmap);
}
