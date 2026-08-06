// GET /api/plugins — list marketplace + installed plugins
// POST /api/plugins — (admin) publish a plugin to marketplace

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { MARKETPLACE_PLUGINS } from "@/lib/agent/plugins/plugin-system";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Get installed plugins from DB
  const installed = await db.plugin.findMany({
    where: { userId, enabled: true },
    orderBy: { createdAt: "desc" },
  });

  const installedIds = new Set(installed.map((p) => p.pluginId));

  // Merge marketplace + installed status
  const marketplace = MARKETPLACE_PLUGINS.map((p) => ({
    ...p,
    installed: installedIds.has(p.id),
  }));

  // Add custom installed plugins not in marketplace
  const customInstalled = installed
    .filter((p) => !installedIds.has(p.pluginId))
    .map((p) => ({
      id: p.pluginId,
      name: p.name,
      version: p.version,
      author: p.author,
      type: p.type,
      description: p.description,
      icon: p.icon,
      verified: p.verified,
      installs: 0,
      installed: true,
      definition: JSON.parse(p.definition || "{}"),
    }));

  return NextResponse.json({
    marketplace,
    installed: [...marketplace.filter((p) => p.installed), ...customInstalled],
    installedCount: installed.length,
  });
}
