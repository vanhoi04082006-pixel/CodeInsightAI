import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { teamId, analysisId } = await req.json();
  if (!teamId || !analysisId) return NextResponse.json({ error: "Missing teamId or analysisId" }, { status: 400 });
  const shared = await db.teamAnalysis.create({ data: { teamId, analysisId, sharedBy: userId } });
  return NextResponse.json({ ok: true, shared });
}
