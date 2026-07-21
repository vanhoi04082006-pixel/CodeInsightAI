// /api/history — per-user analysis history
// GET /api/history                — recent analyses (scoped to authenticated user)
// POST /api/history { id, ... }   — fetch a single analysis (must belong to user)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import type { AnalysisReport, ChatMessage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "20"), 100);
    const rows = await db.analysis.findMany({
      where: { userId },                    // multi-tenant — only this user's analyses
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { _count: { select: { messages: true } } },
    });

    const items = rows.map((r) => ({
      id: r.id,
      repoUrl: r.repoUrl,
      repoOwner: r.repoOwner,
      repoName: r.repoName,
      repoBranch: r.repoBranch,
      status: r.status,
      overallScore: r.overallScore,
      securityScore: r.securityScore,
      performanceScore: r.performanceScore,
      architectureScore: r.architectureScore,
      maintainabilityScore: r.maintainabilityScore,
      codeQualityScore: r.codeQualityScore,
      primaryLanguage: r.primaryLanguage,
      totalFiles: r.totalFiles,
      totalLines: r.totalLines,
      languages: safeParse(r.languages, []),
      frameworks: safeParse(r.frameworks, []),
      messageCount: r._count.messages,
      createdAt: r.createdAt,
    }));

    return NextResponse.json({ items });
  } catch (e) {
    console.error("[/api/history] error", e);
    return NextResponse.json({ items: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    // Ensure the analysis belongs to the user (multi-tenant)
    const row = await db.analysis.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!row || row.userId !== userId) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    let report: AnalysisReport | null = null;
    try {
      report = JSON.parse(row.report) as AnalysisReport;
    } catch {
      report = null;
    }
    const messages: ChatMessage[] = row.messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      createdAt: m.createdAt.getTime(),
    }));

    return NextResponse.json({
      id: row.id,
      repoUrl: row.repoUrl,
      repoOwner: row.repoOwner,
      repoName: row.repoName,
      report,
      messages,
      createdAt: row.createdAt,
    });
  } catch (e) {
    console.error("[/api/history POST] error", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
