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

    const configured = configs.map((c, i) => {
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
        isDefault: i === 0, // first in list = default
      };
    });

    // P3.2: expose the admin's configured fallback chain (stored as JSON on
    // the first/default PlatformAIConfig row). Null if not set.
    const defaultConfig = configs[0] ?? null;
    const fallbackChain = defaultConfig?.fallbackChain ?? null;

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

    return NextResponse.json({ configured, available, fallbackChain });
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

// PATCH — Set provider as default (reorder: move to first position)
export async function PATCH(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  try {
    const body = await req.json();
    if (body.action === "set-default" && body.providerId) {
      const providerId = body.providerId as string;

      // Get the provider to set as default
      const target = await db.platformAIConfig.findUnique({ where: { providerId } });
      if (!target) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

      // Delete all and recreate with target first
      const all = await db.platformAIConfig.findMany({ orderBy: { createdAt: "asc" } });
      const reordered = [target, ...all.filter((c) => c.providerId !== providerId)];

      // Use transaction to reorder
      await db.$transaction([
        db.platformAIConfig.deleteMany({}),
        ...reordered.map((c, i) =>
          db.platformAIConfig.create({
            data: {
              providerId: c.providerId,
              encryptedApiKey: c.encryptedApiKey,
              baseUrl: c.baseUrl,
              models: c.models,
              enabled: c.enabled,
              createdAt: new Date(Date.now() + i * 1000), // ensure order
            },
          })
        ),
      ]);

      await logAdminAction(adminId, "set_default_platform_ai", null, { providerId });

      return NextResponse.json({ success: true, defaultProvider: providerId });
    }

    // P3.2: Save the admin's fallback chain. The chain is a JSON array of
    //   [{ "providerId": "openai", "model": "gpt-4o-mini" }, ...]
    // stored on the first (default) PlatformAIConfig row. Loaded by
    // getFallbackChain() at request time and iterated by callAIWithFallback()
    // when the primary provider returns 402/429/5xx/timeout.
    if (body.action === "save-fallback" && body.fallbackChain !== undefined) {
      const raw = body.fallbackChain as string;

      // Allow empty / null → clears the chain.
      if (!raw || raw.trim() === "" || raw.trim() === "null") {
        const target = await db.platformAIConfig.findFirst({
          where: { enabled: true },
          orderBy: { createdAt: "asc" },
        });
        if (!target) {
          return NextResponse.json({ error: "No enabled Platform AI provider — configure one first" }, { status: 400 });
        }
        await db.platformAIConfig.update({
          where: { id: target.id },
          data: { fallbackChain: null },
        });
        await logAdminAction(adminId, "update_fallback_chain", null, { fallbackChain: null });
        return NextResponse.json({ success: true, fallbackChain: null });
      }

      // Validate JSON: must be an array of {providerId, model} objects.
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
      }
      if (!Array.isArray(parsed)) {
        return NextResponse.json({ error: "Fallback chain must be a JSON array" }, { status: 400 });
      }
      for (const entry of parsed) {
        if (
          typeof entry !== "object" || entry === null ||
          typeof (entry as any).providerId !== "string" ||
          typeof (entry as any).model !== "string"
        ) {
          return NextResponse.json({
            error: "Each fallback entry must be { providerId: string, model: string }",
          }, { status: 400 });
        }
      }

      const target = await db.platformAIConfig.findFirst({
        where: { enabled: true },
        orderBy: { createdAt: "asc" },
      });
      if (!target) {
        return NextResponse.json({ error: "No enabled Platform AI provider — configure one first" }, { status: 400 });
      }
      await db.platformAIConfig.update({
        where: { id: target.id },
        data: { fallbackChain: raw },
      });
      await logAdminAction(adminId, "update_fallback_chain", null, { count: parsed.length });

      return NextResponse.json({ success: true, fallbackChain: raw });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    console.error("[/api/admin/platform-ai PATCH]", e);
    return NextResponse.json({ error: "Failed to apply action" }, { status: 500 });
  }
}

