// POST /api/plugins/install — install a plugin
import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { MARKETPLACE_PLUGINS } from "@/lib/agent/plugins/plugin-system";

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { pluginId } = await req.json();
  if (!pluginId) return NextResponse.json({ error: "Missing 'pluginId'" }, { status: 400 });

  // Find plugin in marketplace
  const manifest = MARKETPLACE_PLUGINS.find((p) => p.id === pluginId);
  if (!manifest) return NextResponse.json({ error: "Plugin not found in marketplace" }, { status: 404 });

  // Check if already installed
  const existing = await db.plugin.findUnique({ where: { pluginId } });
  if (existing) return NextResponse.json({ error: "Plugin already installed", pluginId }, { status: 409 });

  // Install to DB
  const plugin = await db.plugin.create({
    data: {
      pluginId: manifest.id,
      userId,
      name: manifest.name,
      version: manifest.version,
      author: manifest.author,
      type: manifest.type,
      description: manifest.description,
      icon: manifest.icon,
      verified: manifest.verified,
      definition: JSON.stringify(manifest.definition || {}),
    },
  });

  return NextResponse.json({ ok: true, plugin });
}
