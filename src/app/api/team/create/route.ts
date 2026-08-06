import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { name, description } = await req.json();
  if (!name) return NextResponse.json({ error: "Missing 'name'" }, { status: 400 });
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString(36);
  const team = await db.team.create({ data: { name, slug, ownerId: userId, description: description || "" } });
  await db.teamMember.create({ data: { teamId: team.id, userId, role: "owner", status: "active", joinedAt: new Date() } });
  return NextResponse.json({ ok: true, team });
}
