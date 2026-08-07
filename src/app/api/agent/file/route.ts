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

  // `report` is stored as a JSON string in the DB (Prisma `String` column).
  // Must JSON.parse before accessing nested fields — the previous version
  // treated the raw string as `any`, which silently returned empty content
  // for every file (no snippet, no FileInsight match), making the Agent
  // Code View always show "(empty file)".
  let report: any = null;
  try {
    report = typeof analysis.report === "string"
      ? JSON.parse(analysis.report)
      : analysis.report;
  } catch {
    return NextResponse.json({
      path: filePath,
      content: "",
      language: "typescript",
      note: "Analysis report is corrupted (invalid JSON).",
      source: "error",
    }, { status: 200 });
  }

  // 1) Full source map (preferred) — populated by analysis-engine-v2 for EVERY
  //    fetched file (cap 5MB total). This is what makes the Agent Code View
  //    able to browse all files, not just the top-5 most-complex ones.
  const fullContent = report?.fileContents?.[filePath];
  if (typeof fullContent === "string" && fullContent.length > 0) {
    // Infer language from extension for syntax hinting
    const ext = filePath.substring(filePath.lastIndexOf(".") + 1).toLowerCase();
    return NextResponse.json({
      path: filePath,
      content: fullContent,
      language: ext || "typescript",
      source: "fileContents",
    });
  }

  // 2) SPM snippets (file content stored in report.snippets) — top-5 most-complex
  //    files have rawContent here. Legacy fallback for analyses run before
  //    the fileContents map was introduced.
  const snippet = report?.snippets?.find((s: any) => s.file === filePath);
  if (snippet?.rawContent) {
    return NextResponse.json({ path: filePath, content: snippet.rawContent, language: snippet.language || "typescript", source: "snippet" });
  }

  // 3) FileInsight.snippet (representative code snippet — 30-line excerpt)
  const fileInsight = report?.files?.find((f: any) => f.path === filePath);
  if (fileInsight?.snippet) {
    return NextResponse.json({ path: filePath, content: fileInsight.snippet, language: fileInsight.language || "typescript", source: "fileInsight" });
  }

  // No content available — file was either:
  //   - skipped during fetch (over 100KB, or in IGNORE_DIRS)
  //   - dropped by the 5MB total cap on fileContents
  //   - from an analysis run before fileContents was introduced (re-analyze to populate)
  return NextResponse.json({
    path: filePath,
    content: "",
    language: "typescript",
    note: "File content not available in analysis report. The file may have been skipped during fetch (>100KB) or dropped by the 5MB total-content cap. Re-analyze the repo to populate file contents.",
    source: "empty",
  }, { status: 200 });
}
