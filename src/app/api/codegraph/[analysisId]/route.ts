// GET /api/codegraph/[analysisId]?q=query_type&fn=functionName&from=A&to=B&text=search
//
// Query types:
//   stats          — graph statistics (node/edge counts, by type, most connected)
//   search&text=X  — search nodes by label/path
//   callers&fn=X   — find callers of a function
//   callees&fn=X   — find callees of a function
//   impact&file=X  — impact analysis (what breaks if file changes)
//   path&from=A&to=B — shortest path between two nodes
//   neighbors&fn=X — incoming + outgoing neighbors
//   full           — return the entire graph (for visualization)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import {
  type CodeGraph,
  findCallers, findCallees, impactAnalysis, shortestPath,
  searchNodes, getNeighbors, getGraphStats,
} from "@/lib/codegraph/builder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ analysisId: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { analysisId } = await params;
  const analysis = await db.analysis.findUnique({ where: { id: analysisId } });
  if (!analysis || analysis.userId !== userId) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  // Load or build the graph
  let graph: CodeGraph | null = null;
  try {
    const parsedData = analysis.parsedData ? JSON.parse(analysis.parsedData) : null;
    if (parsedData?.files) {
      const { buildCodeGraph } = await import("@/lib/codegraph/builder");
      graph = buildCodeGraph(parsedData);
    }
  } catch { /* ignore */ }

  if (!graph) {
    return NextResponse.json({ error: "CodeGraph not available for this analysis" }, { status: 404 });
  }

  const url = req.nextUrl;
  const q = url.searchParams.get("q") || "stats";

  switch (q) {
    case "stats":
      return NextResponse.json({ stats: getGraphStats(graph) });

    case "search": {
      const text = url.searchParams.get("text") || "";
      return NextResponse.json({ results: searchNodes(graph, text) });
    }

    case "callers": {
      const fn = url.searchParams.get("fn") || "";
      return NextResponse.json({ callers: findCallers(graph, fn) });
    }

    case "callees": {
      const fn = url.searchParams.get("fn") || "";
      return NextResponse.json({ callees: findCallees(graph, fn) });
    }

    case "impact": {
      const file = url.searchParams.get("file") || "";
      return NextResponse.json({ impacted: impactAnalysis(graph, file) });
    }

    case "path": {
      const from = url.searchParams.get("from") || "";
      const to = url.searchParams.get("to") || "";
      return NextResponse.json({ path: shortestPath(graph, from, to) });
    }

    case "neighbors": {
      const fn = url.searchParams.get("fn") || "";
      return NextResponse.json({ neighbors: getNeighbors(graph, fn) });
    }

    case "full":
      return NextResponse.json(graph);

    default:
      return NextResponse.json({ error: "Unknown query type" }, { status: 400 });
  }
}
