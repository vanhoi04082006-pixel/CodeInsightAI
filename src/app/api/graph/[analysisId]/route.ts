// GET /api/graph/[analysisId]?type=<graphType>&q=<query>&node=X&text=X&from=A&to=B
//
// Unified Graph Engine API — a single endpoint that powers the 6 graph
// types (dependencies / call-graph / class-hierarchy / module-imports /
// api-flow / database-flow). Internally:
//
//   1. `getProvider(type).load(analysisId, report)` normalizes the
//      underlying data source (report.dependencies OR CodeGraphSnapshot)
//      into a single `GraphData` shape.
//   2. `new GraphService(data)` builds the adjacency maps + node lookup.
//   3. The `q` query param selects which GraphService method to invoke.
//
// Query params:
//   type      — GraphType (default: "dependencies")
//   q         — query kind (default: "full")
//       full          → entire GraphData + aiConfig (for visualization)
//       stats         → GraphStats summary
//       inspector     → ?node=X → InspectorData (node + incoming/outgoing)
//       search        → ?text=X → matching GraphNode[]
//       top           → ?limit=N → top-N nodes by degree
//       cycles        → circularDeps as string[][]
//       impact        → ?node=X → reverse-BFS dependent set
//       path          → ?from=A&to=B → shortest path nodes[]|null
//       ai-config     → type-specific AI prompt + title
//
// Ownership: each analysis is scoped to its userId — verified before any
// graph work happens so the response is a clean 404 for foreign analyses.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { getProvider } from "@/lib/graph/providers";
import { GraphService } from "@/lib/graph/graph-engine";
import { AIAnalysisService } from "@/lib/graph/ai-analysis-service";
import type { GraphType } from "@/lib/graph/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ analysisId: string }> },
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { analysisId } = await params;

  // Ownership check + load report JSON (needed by the dependency provider,
  // which derives its nodes/edges from `report.dependencies`).
  const analysis = await db.analysis.findUnique({
    where: { id: analysisId },
    select: { userId: true, report: true },
  });
  if (!analysis || analysis.userId !== userId) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  let report: any = null;
  try {
    report = analysis.report ? JSON.parse(analysis.report) : null;
  } catch {
    /* malformed report — continue with null; providers fall back gracefully */
  }

  const url = req.nextUrl;
  const type = (url.searchParams.get("type") || "dependencies") as GraphType;

  const provider = getProvider(type);
  if (!provider) {
    return NextResponse.json(
      { error: `Unknown graph type: ${type}` },
      { status: 400 },
    );
  }

  // Build the normalized GraphData via the provider.
  // Every provider is total (returns a valid possibly-empty GraphData) so
  // the only failure mode here is an actual DB error.
  let data;
  try {
    data = await provider.load(analysisId, report ?? {});
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load graph data" },
      { status: 500 },
    );
  }

  const service = new GraphService(data);
  const q = url.searchParams.get("q") || "full";

  switch (q) {
    case "stats":
      return NextResponse.json({ stats: service.getStats(), type: data.type });

    case "inspector": {
      const node = url.searchParams.get("node") || "";
      const inspector = node ? service.getInspector(node) : null;
      return NextResponse.json({ inspector });
    }

    case "search": {
      const text = url.searchParams.get("text") || "";
      const limit = Number(url.searchParams.get("limit") || "50");
      const results = service.search(text, Number.isFinite(limit) ? limit : 50);
      return NextResponse.json({ results });
    }

    case "top": {
      const limit = Number(url.searchParams.get("limit") || "10");
      return NextResponse.json({ top: service.getTopNodes(limit) });
    }

    case "cycles":
      return NextResponse.json({ cycles: service.findCircularDependencies() });

    case "impact": {
      const node = url.searchParams.get("node") || "";
      return NextResponse.json({ impacted: service.findImpact(node) });
    }

    case "path": {
      const from = url.searchParams.get("from") || "";
      const to = url.searchParams.get("to") || "";
      return NextResponse.json({ path: service.findShortestPath(from, to) });
    }

    case "ai-config":
      return NextResponse.json({ aiConfig: AIAnalysisService.getPrompt(service.data.type) });

    case "full":
    default:
      // Ship the entire normalized graph + the type-specific AI config so the
      // UI can render the canvas and prepare the AI prompt in one round-trip.
      return NextResponse.json({
        nodes: data.nodes,
        edges: data.edges,
        type: data.type,
        stats: data.stats,
        aiConfig: AIAnalysisService.getPrompt(service.data.type),
      });
  }
}
