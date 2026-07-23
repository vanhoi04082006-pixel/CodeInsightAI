// /api/parse — multi-tenant repository parsing.
// POST: parse + persist (must be authenticated)
// GET:  fetch a parsed repo (must belong to the authenticated user)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { parseRepoUrl } from "@/lib/analysis-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const body = await req.json();
    const { repoUrl, files } = body as { repoUrl: string; files?: { path: string; content: string }[] };

    if (!repoUrl) return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });

    const parsedUrl = parseRepoUrl(repoUrl);

    if (files && files.length > 0) {
      const { parseRepository } = await import("@/lib/repo-parser");
      const result = parseRepository(parsedUrl.url, parsedUrl.owner, parsedUrl.name, parsedUrl.branch, files);

      const { analyzeParsedRepository } = await import("@/lib/analysis-engine-v2");
      const report = analyzeParsedRepository(result, files);

      const created = await db.analysis.create({
        data: {
          userId,                          // multi-tenant
          repoUrl: result.url,
          repoOwner: result.owner,
          repoName: result.name,
          repoBranch: result.branch,
          status: "completed",
          overallScore: report.scores.overall,
          securityScore: report.scores.security,
          performanceScore: report.scores.performance,
          architectureScore: report.scores.architecture,
          maintainabilityScore: report.scores.maintainability,
          codeQualityScore: report.scores.codeQuality,
          primaryLanguage: result.languages[0]?.name ?? null,
          totalFiles: result.totalFiles,
          totalLines: result.totalLines,
          languages: JSON.stringify(result.languages),
          frameworks: JSON.stringify(result.frameworks),
          report: JSON.stringify({ ...report, parsed: true, _parsedRepo: result }),
        },
      });

      return NextResponse.json({ id: created.id, parsed: result, report, createdAt: created.createdAt });
    }

    return NextResponse.json({
      error: "File contents required. Repository cloning is not available in this environment.",
      parsed: parsedUrl,
    }, { status: 400 });
  } catch (e) {
    console.error("[/api/parse] error", e);
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const row = await db.analysis.findUnique({ where: { id } });
  if (!row || row.userId !== userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let parsed = null;
  try {
    const report = JSON.parse(row.report);
    parsed = report.parsed ? report : null;
  } catch { parsed = null; }

  return NextResponse.json({ id: row.id, repoUrl: row.repoUrl, repoOwner: row.repoOwner, repoName: row.repoName, parsed, createdAt: row.createdAt });
}
