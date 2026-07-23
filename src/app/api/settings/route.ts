// /api/settings — per-user settings CRUD (multi-tenant)
// GET /api/settings            — load all settings for the authenticated user
// POST /api/settings           — upsert a single setting ({ key, value })
// DELETE /api/settings?key=... — delete a single setting
//
// All operations are scoped to the authenticated user (User.id) — settings are
// never shared between users.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const rows = await db.userSettings.findMany({ where: { userId } });
    const settings: Record<string, any> = {};
    for (const row of rows) {
      try { settings[row.key] = JSON.parse(row.value); } catch { settings[row.key] = row.value; }
    }
    return NextResponse.json({ settings });
  } catch (e) {
    console.error("[/api/settings GET] error", e);
    return NextResponse.json({ settings: {} });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { key, value } = await req.json();
    if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });

    const saved = await db.userSettings.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });

    return NextResponse.json({ success: true, key: saved.key });
  } catch (e) {
    console.error("[/api/settings POST] error", e);
    return NextResponse.json({ error: "Failed to save setting" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const key = req.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });
    await db.userSettings.delete({ where: { userId_key: { userId, key } } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete setting" }, { status: 500 });
  }
}
