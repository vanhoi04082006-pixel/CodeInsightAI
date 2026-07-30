// GET /api/diagram/[analysisId]?type=uml&layout=dagre-tb&format=model|mermaid|svg|plantuml
import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProvider as getGraphProvider } from "@/lib/graph/providers";
import { DiagramEngine } from "@/lib/diagram/diagram-engine";
import type { DiagramType } from "@/lib/diagram/types";
import type { LayoutType } from "@/lib/diagram/diagram-layout";
import type { ExportFormat } from "@/lib/diagram/diagram-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: NextRequest, context: { params: Promise<{ analysisId: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { analysisId } = await context.params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") as DiagramType;
  const layout = (searchParams.get("layout") || "dagre-tb") as LayoutType;
  const format = (searchParams.get("format") || "model") as ExportFormat | "model";

  if (!type) return NextResponse.json({ error: "type required" }, { status: 400 });

  const analysis = await db.analysis.findUnique({
    where: { id: analysisId },
    select: { userId: true, report: true, parsedData: true },
  });
  if (!analysis || analysis.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const report = JSON.parse(analysis.report);

  let graphData: any = null;
  try {
    const provider = getGraphProvider("dependencies");
    if (provider) graphData = await provider.load(analysisId, report);
  } catch {}

  const diagram = DiagramEngine.generate(type, graphData || { nodes: [], edges: [] }, report, layout, analysisId);

  // Export format
  if (format !== "model") {
    const result = DiagramEngine.export(diagram, format as ExportFormat);
    if (result) {
      return NextResponse.json({ ...result, title: diagram.title, description: diagram.description });
    }
  }

  // Return model (serialize Map to array for JSON)
  const layoutArray = diagram.layout ? Array.from(diagram.layout.entries()) : [];
  const stats = DiagramEngine.getStats(diagram);
  return NextResponse.json({ ...diagram, layout: layoutArray, stats });
}
