import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { teamId } = await req.json();
  if (!teamId) return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
  const member = await db.teamMember.update({ where: { teamId_userId: { teamId, userId } }, data: { status: "active", joinedAt: new Date() } });
  return NextResponse.json({ ok: true, member });
}
