import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/settings — load all settings
export async function GET() {
  try {
    const rows = await db.userSettings.findMany();
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

// POST /api/settings — save a setting
// Body: { key, value }
export async function POST(req: NextRequest) {
  try {
    const { key, value } = await req.json();
    if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });

    const saved = await db.userSettings.upsert({
      where: { userId_key: { userId: null as any, key } },
      create: { key, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });

    return NextResponse.json({ success: true, key: saved.key });
  } catch (e) {
    console.error("[/api/settings POST] error", e);
    return NextResponse.json({ error: "Failed to save setting" }, { status: 500 });
  }
}

// DELETE /api/settings?key=... — delete a setting
export async function DELETE(req: NextRequest) {
  try {
    const key = req.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });
    await db.userSettings.delete({ where: { userId_key: { userId: null as any, key } } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete setting" }, { status: 500 });
  }
}
