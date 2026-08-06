import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { analysisId, sprintName } = await req.json();
  if (!analysisId) return NextResponse.json({ error: "Missing analysisId" }, { status: 400 });
  const analysis = await db.analysis.findFirst({ where: { id: analysisId, userId }, select: { report: true } });
  if (!analysis) return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  const report = analysis.report as any;
  // Generate sprint from analysis issues
  const sprint = await db.sprint.create({ data: { name: sprintName || `Sprint from ${report.repoOwner}/${report.repoName}`, goal: "Address top issues from analysis", userId, analysisId } });
  const allIssues = [...(report.issues?.bugs || []), ...(report.issues?.security || []), ...(report.issues?.performance || [])].slice(0, 20);
  for (let i = 0; i < allIssues.length; i++) {
    const issue = allIssues[i];
    await db.pmTask.create({ data: { sprintId: sprint.id, title: issue.title, description: issue.description, priority: issue.severity === "critical" ? "critical" : issue.severity === "high" ? "high" : "medium", effort: issue.effort || "medium", estimate: issue.effort === "trivial" ? 1 : issue.effort === "small" ? 4 : issue.effort === "medium" ? 8 : 16, order: i } });
  }
  const sprintWithTasks = await db.sprint.findUnique({ where: { id: sprint.id }, include: { tasks: true } });
  return NextResponse.json({ ok: true, sprint: sprintWithTasks });
}
