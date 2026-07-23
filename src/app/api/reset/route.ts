// POST /api/reset — delete the CURRENT user's data only (multi-tenant safe).
// NEVER deletes other users' data. Requires authentication.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Delete ONLY the current user's data — never touch other users.
    // Order matters: child rows first (FK constraints).
    const userAnalyses = await db.analysis.findMany({
      where: { userId },
      select: { id: true },
    });
    const analysisIds = userAnalyses.map((a) => a.id);

    const deletedSummaries = analysisIds.length
      ? await db.fileSummary.deleteMany({ where: { analysisId: { in: analysisIds } } })
      : { count: 0 };
    const deletedMessages = analysisIds.length
      ? await db.chatMessage.deleteMany({ where: { analysisId: { in: analysisIds } } })
      : { count: 0 };
    const deletedAnalyses = await db.analysis.deleteMany({ where: { userId } });
    const deletedSettings = await db.userSettings.deleteMany({ where: { userId } });
    const deletedCreds = await db.providerCredential.deleteMany({ where: { userId } });

    return NextResponse.json({
      success: true,
      deleted: {
        analyses: deletedAnalyses.count,
        chatMessages: deletedMessages.count,
        fileSummaries: deletedSummaries.count,
        userSettings: deletedSettings.count,
        credentials: deletedCreds.count,
      },
      message: "Your data has been permanently deleted.",
    });
  } catch (e) {
    console.error("[/api/reset] error", e);
    return NextResponse.json({ error: "Failed to reset data" }, { status: 500 });
  }
}
