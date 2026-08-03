// CodeInsight AI — Agent Permission API (Layer 9)
// POST /api/agent/permission — Respond to permission requests

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { nodeId, granted } = body;

  if (!nodeId || typeof granted !== "boolean") {
    return NextResponse.json({ error: "Missing 'nodeId' or 'granted' field" }, { status: 400 });
  }

  // In production, this would signal the Runtime's PermissionGate
  // For now, just acknowledge
  return NextResponse.json({ ok: true, nodeId, granted });
}
