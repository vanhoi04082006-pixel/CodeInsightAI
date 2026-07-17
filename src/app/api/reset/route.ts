import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/reset — delete ALL data and reset everything
export async function POST(req: NextRequest) {
  try {
    // 1. Delete all file summaries (cascade from analyses)
    const deletedSummaries = await db.fileSummary.deleteMany({});
    // 2. Delete all chat messages
    const deletedMessages = await db.chatMessage.deleteMany({});
    // 3. Delete all analyses
    const deletedAnalyses = await db.analysis.deleteMany({});
    // 4. Delete all user settings
    const deletedSettings = await db.userSettings.deleteMany({});

    return NextResponse.json({
      success: true,
      deleted: {
        analyses: deletedAnalyses.count,
        chatMessages: deletedMessages.count,
        fileSummaries: deletedSummaries.count,
        userSettings: deletedSettings.count,
      },
      message: "All data has been permanently deleted.",
    });
  } catch (e) {
    console.error("[/api/reset] error", e);
    return NextResponse.json({ error: "Failed to reset data" }, { status: 500 });
  }
}
