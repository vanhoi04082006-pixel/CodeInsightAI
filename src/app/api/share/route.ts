// /api/share — Generate a public, read-only shareable link for an analysis.
// POST { analysisId } → { url, token, expiresAt }
// The link works for 7 days and gives read-only access to the report.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHARE_TOKEN_TTL_DAYS = 7;

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { analysisId } = await req.json();
    if (!analysisId) {
      return NextResponse.json({ error: "analysisId is required" }, { status: 400 });
    }
    // Ensure the analysis belongs to the user
    const analysis = await db.analysis.findUnique({ where: { id: analysisId } });
    if (!analysis || analysis.userId !== userId) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }
    // Generate a random URL-safe token (32 hex chars = 16 bytes of entropy)
    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + SHARE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await db.shareToken.create({
      data: {
        token,
        analysisId,
        createdBy: userId,
        expiresAt,
      },
    });

    const origin = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || "http://localhost:3000";
    const url = `${origin}/?share=${token}`;

    return NextResponse.json({ url, token, expiresAt });
  } catch (e) {
    console.error("[/api/share POST]", e);
    return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
  }
}
