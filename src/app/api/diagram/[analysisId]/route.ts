// GET /api/diagram/[analysisId]?type=uml — Generate diagram from GraphData + Report
import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/graph/providers";
import { DiagramEngine } from "@/lib/diagram/diagram-engine";
import { toMermaid } from "@/lib/diagram/diagram-renderer";
import type { DiagramType } from "@/lib/diagram/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: NextRequest, context: { params: Promise<{ analysisId: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { analysisId } = await context.params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") as DiagramType;
  const format = searchParams.get("format") || "model";

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
    const provider = getProvider("dependencies");
    if (provider) graphData = await provider.load(analysisId, report);
  } catch {}

  const diagram = DiagramEngine.generate(type, graphData || { nodes: [], edges: [] }, report);

  if (format === "mermaid") {
    return NextResponse.json({ mermaid: toMermaid(diagram), title: diagram.title, description: diagram.description });
  }

  const layoutArray = diagram.layout ? Array.from(diagram.layout.entries()) : [];
  return NextResponse.json({ ...diagram, layout: layoutArray });
}
