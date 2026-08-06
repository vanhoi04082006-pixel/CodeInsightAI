import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { sprintId, title, description, priority, effort, estimate } = await req.json();
  if (!sprintId || !title) return NextResponse.json({ error: "Missing sprintId or title" }, { status: 400 });
  const order = await db.pmTask.count({ where: { sprintId } });
  const task = await db.pmTask.create({ data: { sprintId, title, description: description || "", priority: priority || "medium", effort: effort || "medium", estimate: estimate || 0, order } });
  return NextResponse.json({ ok: true, task });
}
export async function PATCH(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id, status, priority, assigneeId } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing 'id'" }, { status: 400 });
  const task = await db.pmTask.update({ where: { id }, data: { ...(status && { status }), ...(priority && { priority }), ...(assigneeId !== undefined && { assigneeId }) } });
  return NextResponse.json({ ok: true, task });
}
