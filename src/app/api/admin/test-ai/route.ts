// GET /api/admin/test-ai — Test if Platform AI provider works
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getPlatformAIProvider, getPlatformAIConfig } from "@/lib/platform-ai";
import { callAI } from "@/lib/ai-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const url = new URL(req.url);
  const providerId = url.searchParams.get("provider");
  const model = url.searchParams.get("model");

  try {
    let aiConfig = null;
    if (providerId) {
      console.log(`[test-ai] Testing specific provider: ${providerId}/${model}`);
      aiConfig = await getPlatformAIProvider(providerId, model || undefined);
    }
    if (!aiConfig) {
      console.log(`[test-ai] Trying first available platform AI...`);
      aiConfig = await getPlatformAIConfig();
    }

    if (!aiConfig) {
      return NextResponse.json({
        step: "provider_resolution",
        success: false,
        error: "No Platform AI provider configured.",
        checkedProvider: providerId,
        checkedModel: model,
      }, { status: 404 });
    }

    console.log(`[test-ai] Provider found: ${aiConfig.providerId}/${aiConfig.model}`);
    console.log(`[test-ai] apiKey length: ${aiConfig.apiKey?.length ?? 0}`);

    const testMessages = [
      { role: "system", content: "Respond with valid JSON only." },
      { role: "user", content: 'Return: {"status": "ok", "message": "AI provider working"}' },
    ];

    const result = await callAI(aiConfig, testMessages as any, {
      temperature: 0.1,
      maxTokens: 100,
      timeout: 30,
    });

    return NextResponse.json({
      step: "ai_call",
      success: true,
      provider: aiConfig.providerId,
      model: aiConfig.model,
      baseUrl: aiConfig.baseUrl,
      apiKeyLength: aiConfig.apiKey?.length ?? 0,
      response: result.content,
      usage: result.usage,
    });
  } catch (e: any) {
    console.error(`[test-ai] Error:`, e);
    return NextResponse.json({
      step: "ai_call",
      success: false,
      error: e?.message || String(e),
    }, { status: 500 });
  }
}
