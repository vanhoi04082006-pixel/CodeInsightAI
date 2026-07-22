// GET  /api/admin/platform-ai — Get current Platform AI config (masked key)
// POST /api/admin/platform-ai — Update Platform AI config (provider, key, model)
// DELETE /api/admin/platform-ai — Disable Platform AI (set enabled=false)
//
// Admin-only: admin can choose which AI provider + model is used for Platform AI
// mode (instead of being hardcoded to OpenRouter/Claude via env vars).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { encrypt, decrypt, maskApiKey } from "@/lib/crypto";
import { PRESET_BY_ID, PROVIDER_PRESETS } from "@/lib/providers";
import { logAdminAction } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — return current config (masked key) + available providers/models
export async function GET() {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const config = await db.platformAIConfig.findUnique({ where: { id: "singleton" } });

    let maskedKey = "";
    if (config?.encryptedApiKey) {
      try {
        maskedKey = maskApiKey(decrypt(config.encryptedApiKey));
      } catch { maskedKey = "•••• (decryption failed)"; }
    }

    // Also check env vars as fallback
    const envConfig = {
      hasEnvKey: !!process.env.PLATFORM_AI_API_KEY,
      envProvider: process.env.PLATFORM_AI_PROVIDER || "",
      envModel: process.env.PLATFORM_AI_MODEL || "",
    };

    // Available providers + their models (for admin UI dropdowns)
    const providers = PROVIDER_PRESETS.map((p) => ({
      providerId: p.providerId,
      name: p.name,
      category: p.category,
      models: p.models,
      defaultModel: p.defaultModel,
      defaultBaseUrl: p.defaultBaseUrl,
      requiresKey: p.requiresKey,
      local: p.local,
    }));

    return NextResponse.json({
      config: config ? {
        providerId: config.providerId,
        baseUrl: config.baseUrl,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        enabled: config.enabled,
        maskedKey,
        updatedAt: config.updatedAt,
      } : null,
      envConfig,
      providers,
    });
  } catch (e) {
    console.error("[/api/admin/platform-ai GET]", e);
    return NextResponse.json({ error: "Failed to load config" }, { status: 500 });
  }
}

// POST — update config (create or update singleton)
export async function POST(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { providerId, apiKey, baseUrl, model, temperature, maxTokens, enabled } = body;

    if (!providerId) {
      return NextResponse.json({ error: "providerId is required" }, { status: 400 });
    }

    const preset = PRESET_BY_ID[providerId];
    if (!preset) {
      return NextResponse.json({ error: `Unknown provider: ${providerId}` }, { status: 400 });
    }

    // Build update data
    const data: any = {
      providerId,
      baseUrl: baseUrl || preset.defaultBaseUrl,
      model: model || preset.defaultModel,
      temperature: temperature ?? 0.7,
      maxTokens: maxTokens ?? 4096,
      enabled: enabled ?? true,
    };

    // Only update apiKey if provided (keep existing if not)
    if (apiKey && apiKey.length > 0) {
      data.encryptedApiKey = encrypt(apiKey);
    } else {
      // Check if config exists — if new, apiKey is required
      const existing = await db.platformAIConfig.findUnique({ where: { id: "singleton" } });
      if (!existing) {
        return NextResponse.json({ error: "apiKey is required for initial setup" }, { status: 400 });
      }
      // Keep existing encrypted key (don't overwrite)
    }

    const config = await db.platformAIConfig.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        ...data,
        ...(data.encryptedApiKey ? {} : { encryptedApiKey: "" }),
      },
      update: data,
    });

    // Audit log
    await logAdminAction(adminId, "update_platform_ai", null, {
      providerId,
      model: data.model,
      enabled: data.enabled,
      keyUpdated: !!data.encryptedApiKey,
    });

    // Return masked key
    let maskedKey = "";
    try {
      maskedKey = maskApiKey(decrypt(config.encryptedApiKey));
    } catch { /* ignore */ }

    return NextResponse.json({
      success: true,
      config: {
        providerId: config.providerId,
        baseUrl: config.baseUrl,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        enabled: config.enabled,
        maskedKey,
        updatedAt: config.updatedAt,
      },
    });
  } catch (e) {
    console.error("[/api/admin/platform-ai POST]", e);
    return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
  }
}

// DELETE — disable Platform AI (set enabled=false, keep config for re-enable)
export async function DELETE() {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    await db.platformAIConfig.update({
      where: { id: "singleton" },
      data: { enabled: false },
    });

    await logAdminAction(adminId, "disable_platform_ai", null, {});

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[/api/admin/platform-ai DELETE]", e);
    return NextResponse.json({ error: "Failed to disable" }, { status: 500 });
  }
}
