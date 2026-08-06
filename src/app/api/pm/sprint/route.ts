import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const sprints = await db.sprint.findMany({ where: { userId }, include: { tasks: true }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ sprints });
}
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { name, goal, analysisId } = await req.json();
  if (!name) return NextResponse.json({ error: "Missing 'name'" }, { status: 400 });
  const sprint = await db.sprint.create({ data: { name, goal: goal || "", userId, analysisId } });
  return NextResponse.json({ ok: true, sprint });
}
