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

  // ── Resolve effective provider ──
  // In production, if the client sends a provider without apiKey, look up the
  // encrypted credential from the DB and decrypt it.
  let effectiveProvider = provider;
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
          };
        } catch { /* decryption failed */ }
      }
    }
  }

  // Use the unified resolver (supports all 14 providers)
  const finalProvider = resolveEffectiveProvider(
    body.aiMode,
    effectiveProvider ? {
      providerId: effectiveProvider.providerId,
      apiKey: effectiveProvider.apiKey,
      baseUrl: effectiveProvider.baseUrl,
      model: effectiveProvider.model,
      temperature: effectiveProvider.temperature,
      maxTokens: effectiveProvider.maxTokens,
    } : undefined,
    null
  );

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
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let fullReply = "";

      try {
        // streamAI() yields chunk strings from any of the 14 providers
        for await (const chunk of streamAI(finalProvider, llmMessages, { temperature, maxTokens })) {
          fullReply += chunk;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
        }

        // Send done signal
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, reply: fullReply })}\n\n`));

        // Persist to DB
        if (body.analysisId) {
          try {
            await db.chatMessage.create({
              data: { analysisId: body.analysisId, role: "user", content: message },
            });
            await db.chatMessage.create({
              data: { analysisId: body.analysisId, role: "assistant", content: fullReply },
            });
          } catch { /* best-effort persist */ }
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
