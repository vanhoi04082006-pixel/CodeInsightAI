import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateReport, parseRepoUrl } from "@/lib/analysis-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/analyze  { repoUrl }
// Generates a full AI analysis report and persists it.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { repoUrl } = body as { repoUrl?: string };

    if (!repoUrl || typeof repoUrl !== "string") {
      return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
    }

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed.valid) {
      return NextResponse.json(
        { error: "Invalid GitHub URL. Use https://github.com/owner/repo or owner/repo." },
        { status: 400 }
      );
    }

    const report = generateReport(parsed.url);

    const created = await db.analysis.create({
      data: {
        repoUrl: report.repoUrl,
        repoOwner: report.repoOwner,
        repoName: report.repoName,
        repoBranch: report.repoBranch,
        status: "completed",
        overallScore: report.scores.overall,
        securityScore: report.scores.security,
        performanceScore: report.scores.performance,
        architectureScore: report.scores.architecture,
        maintainabilityScore: report.scores.maintainability,
        codeQualityScore: report.scores.codeQuality,
        primaryLanguage: report.primaryLanguage,
        totalFiles: report.totalFiles,
        totalLines: report.totalLines,
        languages: JSON.stringify(report.languages),
        frameworks: JSON.stringify(report.frameworks),
        report: JSON.stringify(report),
      },
    });

    return NextResponse.json({
      id: created.id,
      report,
      createdAt: created.createdAt,
    });
  } catch (e) {
    console.error("[/api/analyze] error", e);
    return NextResponse.json({ error: "Failed to analyze repository" }, { status: 500 });
  }
}

// GET /api/analyze?limit=12  -> recent analyses (lightweight list)
export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "12"), 50);
    const rows = await db.analysis.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        repoUrl: true,
        repoOwner: true,
        repoName: true,
        repoBranch: true,
        status: true,
        overallScore: true,
        securityScore: true,
        performanceScore: true,
        architectureScore: true,
        maintainabilityScore: true,
        codeQualityScore: true,
        primaryLanguage: true,
        totalFiles: true,
        totalLines: true,
        languages: true,
        frameworks: true,
        createdAt: true,
      },
    });

    const items = rows.map((r) => ({
      ...r,
      languages: safeParse(r.languages, []),
      frameworks: safeParse(r.frameworks, []),
    }));

    return NextResponse.json({ items });
  } catch (e) {
    console.error("[/api/analyze GET] error", e);
    return NextResponse.json({ items: [] });
  }
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
