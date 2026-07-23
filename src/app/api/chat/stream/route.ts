// POST /api/chat/stream — Streaming chat via SSE
// Returns text/event-stream with chunks as AI generates them.
// Uses the unified streamAI() from lib/ai-client.ts — supports all 14 providers.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { isProduction } from "@/lib/env";
import { streamAI, type AIMessage } from "@/lib/ai-client";
import { resolveEffectiveProvider } from "@/lib/platform-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ProviderConfig {
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  label?: string;
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
  platformProvider?: string;   // Pro user's selected platform provider
  platformModel?: string;      // Pro user's selected model
  debug?: boolean;             // Enable debug metadata in done event
}

export async function POST(req: NextRequest) {
  const requestStart = Date.now();
  const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const body = (await req.json()) as ChatBody;
  const { message, history = [], personality, provider, language } = body;

  if (!message || typeof message !== "string") {
    return new Response("data: " + JSON.stringify({ error: "message is required" }) + "\n\n", {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const userId = await requireUserId();

  // ── Resolve effective provider ──
  // In production, if the client sends a provider without apiKey, look up the
  // encrypted credential from the DB and decrypt it.
  let effectiveProvider = provider;
  if (provider && !provider.apiKey && isProduction) {
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
          };
        } catch { /* decryption failed */ }
      }
    }
  }

  // Use the unified resolver (supports all 14 providers)
  // FIXED: Pass platformSelection (4th param) so Pro users get their selected provider
  let finalProvider = await resolveEffectiveProvider(
    body.aiMode,
    effectiveProvider ? {
      providerId: effectiveProvider.providerId,
      apiKey: effectiveProvider.apiKey,
      baseUrl: effectiveProvider.baseUrl,
      model: effectiveProvider.model,
      temperature: effectiveProvider.temperature,
      maxTokens: effectiveProvider.maxTokens,
    } : undefined,
    null,
    // Pro user's selected platform provider + model
    body.platformProvider ? { providerId: body.platformProvider, model: body.platformModel } : null
  );

  // FALLBACK 1: If resolveEffectiveProvider returned null but platformProvider was
  // specified, try getPlatformAIProvider directly (sometimes the resolver misses it)
  if (!finalProvider && body.platformProvider) {
    try {
      const { getPlatformAIProvider } = await import("@/lib/platform-ai");
      finalProvider = await getPlatformAIProvider(body.platformProvider, body.platformModel);
    } catch {}
  }

  // FALLBACK 2: If still null, try first available platform AI
  if (!finalProvider) {
    try {
      const { getPlatformAIConfig } = await import("@/lib/platform-ai");
      finalProvider = await getPlatformAIConfig();
    } catch {}
  }

  // FALLBACK 3: BYOK lookup from DB (if user has any saved credential)
  if (!finalProvider && userId) {
    try {
      const cred = await db.providerCredential.findFirst({
        where: { userId, enabled: true },
        orderBy: { updatedAt: "desc" },
      });
      if (cred) {
        finalProvider = {
          providerId: cred.providerId,
          apiKey: decrypt(cred.encryptedApiKey),
          baseUrl: cred.baseUrl,
          model: cred.model,
          temperature: cred.temperature ?? 0.7,
          maxTokens: cred.maxTokens ?? 4096,
          timeout: 60,
        };
      }
    } catch {}
  }

  if (!finalProvider) {
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

  // Build messages
  const systemPrompt = personality?.systemPrompt || "You are CodeInsight AI, a senior software engineer.";
  const langInstruction = language === "vi" ? "\n\nTrả lời bằng tiếng Việt." : "";
  const llmMessages: AIMessage[] = [
    { role: "system", content: systemPrompt + langInstruction },
    ...history.slice(-10).map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user", content: message },
  ];

  const temperature = personality?.temperature ?? 0.7;
  const maxTokens = personality?.maxTokens && personality.maxTokens > 0 ? personality.maxTokens : 4096;

  // Create SSE stream using the unified streamAI() generator
  // FIXED: Retry logic — if stream returns empty, retry once before giving up
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let fullReply = "";
      let lastError: string | undefined;

      // Retry loop: attempt 1 + attempt 2 (if empty)
      for (let attempt = 0; attempt < 2; attempt++) {
        fullReply = "";
        try {
          for await (const chunk of streamAI(finalProvider!, llmMessages, { temperature, maxTokens })) {
            fullReply += chunk;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
          }

          // If we got content, we're done
          if (fullReply.trim()) {
            break;
          }

          // Empty response — retry if first attempt
          if (attempt === 0) {
            console.warn(`[/api/chat/stream] Empty stream on attempt 1 — retrying...`);
            await new Promise(r => setTimeout(r, 500));
          }
        } catch (err: any) {
          lastError = err?.message || "Stream failed";
          console.warn(`[/api/chat/stream] Attempt ${attempt + 1} error:`, lastError);
          if (attempt === 0) {
            await new Promise(r => setTimeout(r, 500));
          } else {
            // Both attempts failed — send error to client
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: lastError })}\n\n`));
            controller.close();
            return;
          }
        }
      }

      // Send done signal with debug metadata (if requested)
      const totalMs = Date.now() - requestStart;
      const doneData: any = { done: true, reply: fullReply };
      if (body.debug) {
        // Estimate tokens (rough: 1 token ≈ 4 chars)
        const inputTokens = Math.ceil((systemPrompt.length + message.length + history.map(h => h.content).join("").length) / 4);
        const outputTokens = Math.ceil(fullReply.length / 4);
        doneData.debug = {
          log: {
            id: requestId,
            timestamp: requestStart,
            requestId,
            provider: finalProvider?.providerId ?? "unknown",
            model: finalProvider?.model ?? "unknown",
            personality: personality?.name ?? "Default (CTO)",
            durationMs: totalMs,
            queueMs: 0,
            generationMs: totalMs,
            status: lastError ? "error" : "success",
            statusCode: lastError ? 500 : 200,
            error: lastError,
            retryCount: 0,
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
          },
        };
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneData)}\n\n`));

      // Persist to DB
      if (body.analysisId && fullReply.trim()) {
        try {
          await db.chatMessage.create({
            data: { analysisId: body.analysisId, role: "user", content: message },
          });
          await db.chatMessage.create({
            data: { analysisId: body.analysisId, role: "assistant", content: fullReply },
          });
        } catch { /* best-effort persist */ }
      }

      // Increment usage (best-effort)
      if (userId) {
        try {
          const { incrementUsage } = await import("@/lib/billing/usage");
          incrementUsage(userId, "chat").catch(() => {});
        } catch {}
      }

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
