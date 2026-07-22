// POST /api/admin/platform-ai/test — Test admin-saved provider key
// Decrypts the key server-side and sends a ping to the provider.
// Never exposes the raw key to the frontend.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { decrypt } from "@/lib/crypto";
import { PRESET_BY_ID } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  try {
    const { providerId } = await req.json();
    if (!providerId) return NextResponse.json({ error: "providerId required" }, { status: 400 });

    const config = await db.platformAIConfig.findUnique({ where: { providerId } });
    if (!config) return NextResponse.json({ error: "Provider not configured" }, { status: 404 });

    // Decrypt key
    let apiKey: string;
    try {
      apiKey = decrypt(config.encryptedApiKey);
    } catch {
      return NextResponse.json({ status: "error", error: "Key decryption failed" });
    }

    const preset = PRESET_BY_ID[providerId];
    const models = JSON.parse(config.models || "[]");

    // For testing, use a CHEAP + RELIABLE model per provider.
    // Don't use the first model from the list (might be expensive or deprecated).
    // This is just a "ping" to verify the API key works — not a real analysis.
    const TEST_MODELS: Record<string, string> = {
      openrouter: "openai/gpt-4o-mini",        // cheapest OpenRouter model
      openai: "gpt-4o-mini",
      anthropic: "claude-3-5-haiku-20241022",   // cheapest Anthropic model
      gemini: "gemini-1.5-flash",
      deepseek: "deepseek-chat",
      groq: "llama-3.1-8b-instant",
      together: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      fireworks: "accounts/fireworks/models/llama-v3p3-70b-instruct",
      mistral: "mistral-small-latest",
      xai: "grok-2-mini",
      azure: models[0] || "gpt-4o-mini",
      custom: models[0] || "gpt-4o-mini",
    };

    let model = TEST_MODELS[providerId] || models[0] || preset?.defaultModel || "gpt-4o-mini";
    const start = Date.now();

    // Build test request based on provider
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    try {
      let url: string;
      let headers: Record<string, string> = { "Content-Type": "application/json" };
      let body: Record<string, unknown>;

      if (providerId === "anthropic") {
        url = config.baseUrl.endsWith("/v1") ? `${config.baseUrl}/messages` : `${config.baseUrl}/v1/messages`;
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
        body = { model, max_tokens: 16, messages: [{ role: "user", content: "ping" }] };
      } else if (providerId === "gemini") {
        url = `${config.baseUrl.replace(/\/$/, "")}/models/${model}:generateContent?key=${apiKey}`;
        body = { contents: [{ role: "user", parts: [{ text: "ping" }] }], generationConfig: { maxOutputTokens: 16 } };
      } else {
        url = config.baseUrl.endsWith("/v1") ? `${config.baseUrl}/chat/completions` : `${config.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
        headers["Authorization"] = `Bearer ${apiKey}`;
        if (providerId === "openrouter") {
          headers["HTTP-Referer"] = "https://codeinsight.ai";
          headers["X-Title"] = "CodeInsight AI";
        }
        body = { model, messages: [{ role: "user", content: "ping" }], max_tokens: 16 };
      }

      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
      clearTimeout(timer);
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        let errMsg = `HTTP ${res.status}`;
        try { const j = JSON.parse(errText); errMsg = j.error?.message || j.message || errMsg; } catch { if (errText) errMsg = errText.slice(0, 200); }
        if (res.status === 401 || res.status === 403) errMsg = `Auth failed (${res.status}). Check API key.`;
        if (res.status === 404) errMsg = `Model or endpoint not found (404). Verify model name.`;
        return NextResponse.json({ status: "error", latencyMs, error: errMsg });
      }

      return NextResponse.json({ status: "connected", latencyMs, model });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    return NextResponse.json({ status: "error", error: "Test failed" }, { status: 500 });
  }
}
