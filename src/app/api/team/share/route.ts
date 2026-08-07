import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { teamId, analysisId } = await req.json();
  if (!teamId || !analysisId) return NextResponse.json({ error: "Missing teamId or analysisId" }, { status: 400 });

  // Audit fix F3: Only active members can share
  const caller = await db.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } });
  if (!caller || caller.status !== "active") {
    return NextResponse.json({ error: "Only active team members can share analyses" }, { status: 403 });
  }

  const shared = await db.teamAnalysis.create({ data: { teamId, analysisId, sharedBy: userId } });
  return NextResponse.json({ ok: true, shared });
}
