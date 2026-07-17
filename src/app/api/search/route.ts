import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { semanticSearch } from "@/lib/prompt-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/search — semantic search over a parsed repository
// Body: { analysisId, query }
export async function POST(req: NextRequest) {
  try {
    const { analysisId, query } = await req.json();
    if (!analysisId || !query) return NextResponse.json({ error: "analysisId and query required" }, { status: 400 });

    const row = await db.analysis.findUnique({ where: { id: analysisId } });
    if (!row) return NextResponse.json({ error: "analysis not found" }, { status: 404 });

    let parsed = null;
    try {
      const report = JSON.parse(row.report);
      if (report.parsed) parsed = report;
    } catch { /* not a parsed repo */ }

    if (!parsed) {
      return NextResponse.json({ error: "Repository has not been parsed. Run analysis first." }, { status: 400 });
    }

    const results = semanticSearch(parsed, query);
    return NextResponse.json({ query, results, total: results.length });
  } catch (e) {
    console.error("[/api/search] error", e);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
