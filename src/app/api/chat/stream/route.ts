// POST /api/chat/stream — Streaming chat via SSE
// Returns text/event-stream with chunks as AI generates them
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { isProduction } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ProviderConfig {
  providerId: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

interface PersonalityConfig {
  id?: string;
  name?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  preferredModel?: string;
}

interface ChatBody {
  message: string;
  analysisId?: string;
  history?: { role: string; content: string }[];
  personality?: PersonalityConfig;
  provider?: ProviderConfig;
  language?: string;
  aiMode?: "byok" | "platform";
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ChatBody;
  const { message, history = [], personality, provider, language } = body;

  if (!message || typeof message !== "string") {
    return new Response("data: " + JSON.stringify({ error: "message is required" }) + "\n\n", {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  // If no provider AND no Platform AI, fall back
  let effectiveProvider = provider;
  // Production: look up the encrypted credential from DB when client has no apiKey
  if (provider && !provider.apiKey && isProduction) {
    const userId = await requireUserId();
    if (userId) {
      const cred = await db.providerCredential.findFirst({
        where: {
          userId,
          providerId: provider.providerId,
          ...(provider.label ? { label: provider.label } : {}),
          enabled: true,
        },
      });
      if (cred) {
        try {
          const realKey = decrypt(cred.encryptedApiKey);
          effectiveProvider = {
            ...provider,
            apiKey: realKey,
            baseUrl: cred.baseUrl || provider.baseUrl,
            model: cred.model || provider.model,
            temperature: cred.temperature ?? provider.temperature,
            maxTokens: cred.maxTokens ?? provider.maxTokens,
            streaming: cred.streaming ?? provider.streaming,
          };
        } catch { /* decryption failed */ }
      }
    }
  }

  const usePlatformAI = body.aiMode === "platform" || (!effectiveProvider?.apiKey && process.env.PLATFORM_AI_API_KEY);

  if (!effectiveProvider?.apiKey && !usePlatformAI) {
    const fallback = "⚠️ No AI provider configured. Add a provider in AI Providers settings (BYOK) or switch to Platform AI mode.";
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(`data: ${JSON.stringify({ chunk: fallback, done: true })}\n\n`);
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  // Use Platform AI config if in platform mode
  const finalProvider = usePlatformAI ? {
    providerId: process.env.PLATFORM_AI_PROVIDER || "openrouter",
    apiKey: process.env.PLATFORM_AI_API_KEY || "",
    baseUrl: process.env.PLATFORM_AI_BASE_URL || "https://openrouter.ai/api/v1",
    model: process.env.PLATFORM_AI_MODEL || "anthropic/claude-3.5-sonnet",
    temperature: 0.7,
    maxTokens: 4096,
    timeout: 60,
  } : effectiveProvider;

  // Build messages
  const systemPrompt = personality?.systemPrompt || "You are CodeInsight AI, a senior software engineer.";
  const langInstruction = language === "vi" ? "\n\nTrả lời bằng tiếng Việt." : "";
  const llmMessages = [
    { role: "system", content: systemPrompt + langInstruction },
    ...history.slice(-10).map(h => ({ role: h.role as string, content: h.content })),
    { role: "user", content: message },
  ];

  const temperature = personality?.temperature ?? finalProvider!.temperature ?? 0.7;
  const maxTokens = personality?.maxTokens && personality.maxTokens > 0 ? personality.maxTokens : (finalProvider!.maxTokens && finalProvider!.maxTokens > 0 ? finalProvider!.maxTokens : 4096);
  const model = finalProvider!.model || "gpt-4o-mini";

  // Build request to provider with stream: true
  let url: string;
  let headers: Record<string, string> = { "Content-Type": "application/json" };
  let reqBody: Record<string, unknown>;

  if (finalProvider!.providerId === "anthropic") {
    url = finalProvider!.baseUrl.endsWith("/v1") ? `${finalProvider!.baseUrl}/messages` : `${finalProvider!.baseUrl}/v1/messages`;
    headers["x-api-key"] = finalProvider!.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    const systemMsg = llmMessages.find(m => m.role === "system")?.content || "";
    const chatMsgs = llmMessages.filter(m => m.role !== "system").map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));
    reqBody = {
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemMsg,
      messages: chatMsgs,
      stream: true,
    };
  } else {
    // OpenAI-compatible (default)
    url = finalProvider!.baseUrl.endsWith("/v1") ? `${finalProvider!.baseUrl}/chat/completions` : `${finalProvider!.baseUrl}/v1/chat/completions`;
    if (finalProvider!.apiKey) headers["Authorization"] = `Bearer ${finalProvider!.apiKey}`;
    reqBody = {
      model,
      messages: llmMessages.map(m => ({ role: m.role, content: m.content })),
      temperature,
      max_tokens: maxTokens,
      stream: true,
    };
  }

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let fullReply = "";

      try {
        const providerRes = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(reqBody),
        });

        if (!providerRes.ok) {
          const errText = await providerRes.text().catch(() => "");
          const errMsg = `Provider error (${providerRes.status}): ${errText.slice(0, 200)}`;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`));
          controller.close();
          return;
        }

        const reader = providerRes.body?.getReader();
        if (!reader) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "No response body" })}\n\n`));
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;

            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              let chunk = "";

              if (finalProvider!.providerId === "anthropic") {
                if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                  chunk = parsed.delta.text;
                }
              } else {
                chunk = parsed.choices?.[0]?.delta?.content || "";
              }

              if (chunk) {
                fullReply += chunk;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
              }
            } catch {
              // ignore parse errors for partial chunks
            }
          }
        }

        // Send done signal
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, reply: fullReply })}\n\n`));

        // Persist to DB
        if (body.analysisId) {
          try {
            await db.chatMessage.create({
              data: {
                analysisId: body.analysisId,
                role: "user",
                content: message,
              },
            });
            await db.chatMessage.create({
              data: {
                analysisId: body.analysisId,
                role: "assistant",
                content: fullReply,
              },
            });
          } catch {
            // best-effort persist
          }
        }
      } catch (err: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err?.message || "Stream failed" })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
