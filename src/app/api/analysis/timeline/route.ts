// GET /api/analysis/timeline?repoOwner=<owner>&repoName=<name>
//
// Phase 2 (P2.2) — Timeline of analyses for a single repo.
// Returns a chronological list of analyses (oldest → newest) with their
// scores, used by the TimelineTab to render the score trajectory chart and
// populate the "compare from → to" dropdowns.
//
// Auth: ownership-checks via userId (multi-tenant).
// Select only the columns needed to draw the chart + populate the dropdown:
// id, createdAt, report (for scores), aiStatus. Does NOT load parsedData.
//
// Response shape:
//   {
//     analyses: Array<{
//       id: string;
//       createdAt: string;     // ISO
//       scores: { overall, security, performance, architecture,
//                 maintainability, codeQuality };
//       aiStatus: string;      // none | pending | done | failed
//     }>
//   }

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import type { AnalysisReport } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

interface TimelineEntry {
  id: string;
  createdAt: string;
  scores: {
    overall: number;
    security: number;
    performance: number;
    architecture: number;
    maintainability: number;
    codeQuality: number;
  };
  aiStatus: string;
}

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const repoOwner = searchParams.get("repoOwner");
  const repoName = searchParams.get("repoName");
  if (!repoOwner || !repoName) {
    return NextResponse.json(
      { error: "repoOwner and repoName query parameters required" },
      { status: 400 }
    );
  }

  // Chronological order — oldest first so the chart reads left→right over time.
  // Index on (repoOwner, repoName) makes this efficient (see prisma/schema.prisma).
  const rows = await db.analysis.findMany({
    where: { repoOwner, repoName, userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      report: true,
      aiStatus: true,
    },
  });

  const analyses: TimelineEntry[] = rows.map((r) => {
    let scores: TimelineEntry["scores"] = {
      overall: 0,
      security: 0,
      performance: 0,
      architecture: 0,
      maintainability: 0,
      codeQuality: 0,
    };
    try {
      const report = JSON.parse(r.report) as AnalysisReport;
      const s = report?.scores;
      if (s) {
        scores = {
          overall: s.overall ?? 0,
          security: s.security ?? 0,
          performance: s.performance ?? 0,
          architecture: s.architecture ?? 0,
          maintainability: s.maintainability ?? 0,
          codeQuality: s.codeQuality ?? 0,
        };
      }
    } catch {
      // malformed report — leave zeros
    }
    return {
      id: r.id,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
      scores,
      aiStatus: r.aiStatus,
    };
  });

  return NextResponse.json({ analyses });
}
