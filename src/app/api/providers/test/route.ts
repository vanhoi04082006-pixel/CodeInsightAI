import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/providers/test
 * Tests connectivity to a user-configured AI provider by sending a minimal
 * chat completion request and measuring latency. Supports OpenAI-compatible,
 * Anthropic, Gemini, and local (Ollama / LM Studio) providers.
 *
 * NOTE: apiKey is accepted but NEVER logged or echoed back.
 */
interface TestBody {
  providerId?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeout?: number; // seconds
}

export async function POST(req: NextRequest) {
  const start = Date.now();
  const body = (await req.json().catch(() => ({}))) as TestBody;
  const { providerId, apiKey, baseUrl, model, timeout } = body;

  if (!providerId || typeof providerId !== "string") {
    return NextResponse.json({ status: "error", error: "providerId is required" }, { status: 400 });
  }
  if (!baseUrl || typeof baseUrl !== "string") {
    return NextResponse.json({ status: "error", error: "baseUrl is required" }, { status: 400 });
  }

  const isLocal = providerId === "ollama" || providerId === "lmstudio";
  if (!isLocal && !apiKey) {
    return NextResponse.json(
      { status: "error", error: "API key is required for this provider" },
      { status: 400 }
    );
  }

  const modelId = model || "gpt-4o-mini";
  const timeoutMs = ((timeout && timeout > 0 ? timeout : 60) as number) * 1000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let url: string;
    let headers: Record<string, string> = { "Content-Type": "application/json" };
    let payload: Record<string, unknown>;

    if (providerId === "anthropic") {
      url = baseUrl.endsWith("/v1") ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`;
      headers["x-api-key"] = apiKey || "";
      headers["anthropic-version"] = "2023-06-01";
      payload = {
        model: modelId,
        max_tokens: 16,
        messages: [{ role: "user", content: "ping" }],
      };
    } else if (providerId === "gemini") {
      url = `${baseUrl.replace(/\/$/, "")}/models/${modelId}:generateContent?key=${apiKey}`;
      payload = {
        contents: [{ role: "user", parts: [{ text: "ping" }] }],
        generationConfig: { maxOutputTokens: 16 },
      };
    } else {
      // OpenAI-compatible (OpenRouter, OpenAI, DeepSeek, Groq, Together, etc.)
      url = baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      // OpenRouter recommends these for attribution / ranking
      if (providerId === "openrouter") {
        headers["HTTP-Referer"] = "https://codeinsight.ai";
        headers["X-Title"] = "CodeInsight AI";
      }
      payload = {
        model: modelId,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 16,
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errJson.message || errJson.error || errMsg;
      } catch {
        if (errText) errMsg = errText.substring(0, 300);
      }
      // Common, actionable hints
      if (res.status === 401 || res.status === 403) {
        errMsg = `Authentication failed (${res.status}). Check your API key.`;
      } else if (res.status === 404) {
        errMsg = `Model or endpoint not found (404). Verify the model name "${modelId}" and base URL.`;
      }
      return NextResponse.json({ status: "error", latencyMs, error: errMsg });
    }

    // Optional: verify response shape so a 200 with junk still fails loudly
    const data = await res.json().catch(() => null);
    const ok =
      data != null &&
      (data.choices?.[0]?.message?.content !== undefined ||
        data.content?.[0]?.text !== undefined ||
        data.candidates?.[0]?.content?.parts?.[0]?.text !== undefined ||
        typeof data === "object");
    if (!ok) {
      return NextResponse.json({
        status: "error",
        latencyMs,
        error: "Provider returned an unexpected response shape.",
      });
    }

    return NextResponse.json({ status: "connected", latencyMs, model: modelId });
  } catch (e) {
    const latencyMs = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    const display = msg.includes("aborted")
      ? `Request timed out after ${Math.round(timeoutMs / 1000)}s`
      : msg.includes("fetch")
        ? "Network error — could not reach the provider. Check base URL and your connection."
        : msg;
    return NextResponse.json({ status: "error", latencyMs, error: display });
  } finally {
    clearTimeout(timer);
  }
}
