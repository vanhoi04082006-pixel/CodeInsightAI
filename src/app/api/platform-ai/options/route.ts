// GET /api/platform-ai/options — Returns admin-configured providers + models.
// Pro users call this to see which providers/models they can use (with admin's key).
// Free users see empty list (they use BYOK).
//
// Response:
//   { providers: [{ providerId, name, category, models: [...] }], isPro: boolean }
//
// The API key is NEVER exposed — only provider names + model lists.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { PRESET_BY_ID } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    // Check if user is Pro or Admin
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { plan: true, role: true },
    });
    const isPro = (user?.plan !== "free") || (user?.role === "admin");

    if (!isPro) {
      // Free users — empty list (they use BYOK)
      return NextResponse.json({ providers: [], isPro: false });
    }

    // Pro/Admin — return all enabled admin-configured providers
    const configs = await db.platformAIConfig.findMany({
      where: { enabled: true },
      orderBy: { createdAt: "asc" },
    });

    let providers = configs.map((c) => {
      const preset = PRESET_BY_ID[c.providerId];
      return {
        providerId: c.providerId,
        name: preset?.name || c.providerId,
        category: preset?.category || "Unknown",
        baseUrl: c.baseUrl,
        models: JSON.parse(c.models || "[]"),
      };
    });

    // FALLBACK: If no DB configs, check env vars (PLATFORM_AI_API_KEY etc.)
    if (providers.length === 0 && process.env.PLATFORM_AI_API_KEY) {
      const envProviderId = process.env.PLATFORM_AI_PROVIDER || "shopaikey";
      const preset = PRESET_BY_ID[envProviderId];
      providers = [{
        providerId: envProviderId,
        name: preset?.name || envProviderId,
        category: preset?.category || "Cloud",
        baseUrl: process.env.PLATFORM_AI_BASE_URL || preset?.defaultBaseUrl || "",
        // Use ALL models from preset (8 models for ShopAIKey), not just PLATFORM_AI_MODEL
        models: preset?.models || [process.env.PLATFORM_AI_MODEL || "gpt-4.1-mini"],
      }];
    }

    return NextResponse.json({ providers, isPro: true });
  } catch (e) {
    console.error("[/api/platform-ai/options]", e);
    return NextResponse.json({ providers: [], isPro: false });
  }
}
