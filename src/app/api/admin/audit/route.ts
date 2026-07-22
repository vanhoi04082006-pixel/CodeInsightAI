// GET /api/admin/audit — Audit log of admin actions.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  try {
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "50"), 200);
    const action = req.nextUrl.searchParams.get("action") ?? undefined;

    const logs = await db.auditLog.findMany({
      where: action ? { action } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        admin: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    return NextResponse.json({ logs, total: logs.length });
  } catch (e) {
    console.error("[/api/admin/audit]", e);
    return NextResponse.json({ error: "Failed to load audit log" }, { status: 500 });
  }
}
