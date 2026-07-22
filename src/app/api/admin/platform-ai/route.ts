// /api/admin/platform-ai — Admin manages MULTIPLE AI provider configs.
// GET    — list all configured providers (masked keys)
// POST   — add/update a provider config { providerId, apiKey, baseUrl, models }
// DELETE — remove a provider config ?providerId=openrouter
//
// Pro users then choose which provider + model to use via /api/platform-ai/options
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { encrypt, decrypt, maskApiKey } from "@/lib/crypto";
import { PRESET_BY_ID, PROVIDER_PRESETS } from "@/lib/providers";
import { logAdminAction } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — list all configured providers + available presets
export async function GET() {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  try {
    const configs = await db.platformAIConfig.findMany({ orderBy: { createdAt: "asc" } });

    const configured = configs.map((c) => {
      let maskedKey = "••••";
      try { maskedKey = maskApiKey(decrypt(c.encryptedApiKey)); } catch {}
      const preset = PRESET_BY_ID[c.providerId];
      return {
        id: c.id,
        providerId: c.providerId,
        name: preset?.name || c.providerId,
        category: preset?.category || "Unknown",
        baseUrl: c.baseUrl,
        models: JSON.parse(c.models || "[]"),
        enabled: c.enabled,
        maskedKey,
        updatedAt: c.updatedAt,
      };
    });

    // Available providers NOT yet configured
    const configuredIds = new Set(configs.map((c) => c.providerId));
    const available = PROVIDER_PRESETS
      .filter((p) => !p.local && !configuredIds.has(p.providerId))
      .map((p) => ({
        providerId: p.providerId,
        name: p.name,
        category: p.category,
        models: p.models,
        defaultModel: p.defaultModel,
        defaultBaseUrl: p.defaultBaseUrl,
      }));

    return NextResponse.json({ configured, available });
  } catch (e) {
    console.error("[/api/admin/platform-ai GET]", e);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

// POST — add or update a provider config
export async function POST(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  try {
    const { providerId, apiKey, baseUrl, models, enabled } = await req.json();
    if (!providerId) return NextResponse.json({ error: "providerId required" }, { status: 400 });

    const preset = PRESET_BY_ID[providerId];
    if (!preset) return NextResponse.json({ error: `Unknown provider: ${providerId}` }, { status: 400 });

    const finalBaseUrl = baseUrl || preset.defaultBaseUrl;
    const finalModels = models?.length > 0 ? models : preset.models;

    // apiKey required for new, optional for update
    let encrypted: string | null = null;
    if (apiKey && apiKey.length > 0) {
      encrypted = encrypt(apiKey);
    } else {
      const existing = await db.platformAIConfig.findUnique({ where: { providerId } });
      if (!existing) return NextResponse.json({ error: "apiKey required for new provider" }, { status: 400 });
      encrypted = existing.encryptedApiKey;
    }

    const config = await db.platformAIConfig.upsert({
      where: { providerId },
      create: {
        providerId,
        encryptedApiKey: encrypted,
        baseUrl: finalBaseUrl,
        models: JSON.stringify(finalModels),
        enabled: enabled ?? true,
      },
      update: {
        ...(encrypted ? { encryptedApiKey: encrypted } : {}),
        baseUrl: finalBaseUrl,
        models: JSON.stringify(finalModels),
        enabled: enabled ?? true,
      },
    });

    await logAdminAction(adminId, "update_platform_ai", null, { providerId, models: finalModels });

    return NextResponse.json({ success: true, providerId: config.providerId });
  } catch (e) {
    console.error("[/api/admin/platform-ai POST]", e);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

// DELETE — remove a provider config
export async function DELETE(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  try {
    const providerId = req.nextUrl.searchParams.get("providerId");
    if (!providerId) return NextResponse.json({ error: "providerId required" }, { status: 400 });

    await db.platformAIConfig.delete({ where: { providerId } });
    await logAdminAction(adminId, "remove_platform_ai", null, { providerId });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
