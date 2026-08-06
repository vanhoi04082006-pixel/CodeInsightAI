import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const teams = await db.teamMember.findMany({ where: { userId, status: "active" }, include: { team: { include: { members: true } } }, orderBy: { joinedAt: "desc" } });
  return NextResponse.json({ teams: teams.map((t) => ({ ...t.team, role: t.role, memberCount: t.team.members.filter(m => m.status === "active").length })) });
}
