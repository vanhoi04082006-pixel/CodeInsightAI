// CodeInsight AI — Stage 3 fix: File content API for Workspace Code View
// GET /api/agent/file?analysisId=X&path=src/auth.ts
// Returns the full file content from SPM (SemanticProjectModel).

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const analysisId = searchParams.get("analysisId");
  const filePath = searchParams.get("path");

  if (!analysisId || !filePath) {
    return NextResponse.json({ error: "Missing analysisId or path" }, { status: 400 });
  }

  // Verify ownership
  const analysis = await db.analysis.findFirst({
    where: { id: analysisId, userId },
    select: { id: true, report: true },
  });

  if (!analysis) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const report = analysis.report as any;

  // Try SPM snippets first (file content stored in report.snippets)
  const snippet = report?.snippets?.find((s: any) => s.file === filePath);
  if (snippet?.rawContent) {
    return NextResponse.json({ path: filePath, content: snippet.rawContent, language: snippet.language || "typescript" });
  }

  // Fallback: FileInsight.snippet (representative code snippet)
  const fileInsight = report?.files?.find((f: any) => f.path === filePath);
  if (fileInsight?.snippet) {
    return NextResponse.json({ path: filePath, content: fileInsight.snippet, language: fileInsight.language || "typescript" });
  }

  // No content available
  return NextResponse.json({
    path: filePath,
    content: "",
    language: "typescript",
    note: "File content not available in analysis report. Run a deeper analysis to capture full source.",
  }, { status: 200 });
}
