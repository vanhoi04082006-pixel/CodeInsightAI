// CodeInsight AI — Audit log helper for admin actions.
//
// Every admin API route that mutates state (upgrade, ban, delete, etc.)
// MUST call logAdminAction() before returning, so we have a full trail of
// who did what to whom.

import { db } from "@/lib/db";

export async function logAdminAction(
  adminId: string,
  action: string,
  targetId?: string | null,
  details?: Record<string, any>,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        adminId,
        action,
        targetId: targetId ?? null,
        details: JSON.stringify(details ?? {}),
      },
    });
  } catch (e) {
    // Audit log failure must NEVER break the main operation — just log it.
    console.error("[audit] Failed to log admin action:", e);
  }
}
