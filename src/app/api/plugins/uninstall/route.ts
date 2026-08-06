// POST /api/plugins/uninstall — uninstall a plugin
import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { pluginId } = await req.json();
  if (!pluginId) return NextResponse.json({ error: "Missing 'pluginId'" }, { status: 400 });

  // Delete from DB
  const deleted = await db.plugin.deleteMany({ where: { pluginId, userId } });

  if (deleted.count === 0) return NextResponse.json({ error: "Plugin not found" }, { status: 404 });

  return NextResponse.json({ ok: true, pluginId, deleted: deleted.count });
}
