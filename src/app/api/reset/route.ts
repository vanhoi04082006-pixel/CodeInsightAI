import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/reset — delete ALL analyses, chat messages, and reset everything
export async function POST(req: NextRequest) {
  try {
    // 1. Delete all chat messages (cascade delete from analyses)
    const deletedMessages = await db.chatMessage.deleteMany({});
    // 2. Delete all analyses
    const deletedAnalyses = await db.analysis.deleteMany({});

    return NextResponse.json({
      success: true,
      deleted: {
        analyses: deletedAnalyses.count,
        chatMessages: deletedMessages.count,
      },
      message: "All data has been permanently deleted.",
    });
  } catch (e) {
    console.error("[/api/reset] error", e);
    return NextResponse.json({ error: "Failed to reset data" }, { status: 500 });
  }
}
