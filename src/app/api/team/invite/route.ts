import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { teamId, inviteeId } = await req.json();
  if (!teamId || !inviteeId) return NextResponse.json({ error: "Missing teamId or inviteeId" }, { status: 400 });
  const existing = await db.teamMember.findUnique({ where: { teamId_userId: { teamId, userId: inviteeId } } });
  if (existing) return NextResponse.json({ error: "Already invited" }, { status: 409 });
  const member = await db.teamMember.create({ data: { teamId, userId: inviteeId, role: "member", status: "pending" } });
  return NextResponse.json({ ok: true, member });
}
