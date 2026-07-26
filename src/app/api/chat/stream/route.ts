// POST /api/chat/stream — Streaming chat via SSE
// Returns text/event-stream with chunks as AI generates them.
// Uses the unified streamAI() from lib/ai-client.ts — supports all 14 providers.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, verifyAnalysisOwnership } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { isProduction } from "@/lib/env";
import { streamAI, type AIMessage, TokenBudgetExceededError } from "@/lib/ai-client";
import { shouldFallback, getFallbackChain, type FallbackProvider } from "@/lib/ai-fallback";
import { getUserPlanInfo } from "@/lib/billing/token-budget";
import {
  enforceRateLimit,
  rateLimit429Body,
  rateLimitHeaders,
  retryAfterSeconds,
  maybeCleanupOldBuckets,
} from "@/lib/rate-limiter";
import { resolveEffectiveProvider } from "@/lib/platform-ai";
import type { AIProviderConfig } from "@/lib/ai-client";

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
  // P3.7: optional share token — see /api/chat/route.ts for the rationale.
  shareToken?: string;
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

  // P3.1 + P3.3: hoist the plan/role lookup to the top of the handler so
  // both the hourly rate-limit check (P3.3) and the monthly token-budget
  // enforcement inside streamAI() (P3.1) share the same lookup. Anonymous
  // users (no userId) default to free — they're handled below.
  const planInfo = userId ? await getUserPlanInfo(userId) : { plan: "free", role: "user" };

  // P3.3: per-user hourly rate limit (DB-backed — survives Vercel serverless
  // cold-starts). For streaming, fail-fast with a clean HTTP 429 + SSE event
  // BEFORE opening the connection — once chunks start flowing we can't surface
  // a clean error to the client. Shares the "chat" bucket with /api/chat
  // (same user action). Free: 20/h, Pro: 200/h, Team: 1000/h, Enterprise: unlimited.
  if (userId) {
    const rl = await enforceRateLimit(userId, planInfo.plan, "chat");
    if (rl.blocked) {
      return new Response(
        "data: " + JSON.stringify(rateLimit429Body(rl.status!, "chat")) + "\n\n",
        {
          status: 429,
          headers: {
            "Content-Type": "text/event-stream",
            "Retry-After": String(retryAfterSeconds(rl.status)),
            ...rateLimitHeaders(rl.status),
          },
        },
      );
    }
    // Opportunistic cleanup of stale buckets (~1% of requests, fire-and-forget).
    maybeCleanupOldBuckets();
  }

  // P3.7 (multi-tenant isolation): when an analysisId is supplied, verify
  // ownership (or valid share token) BEFORE streaming. Without this check,
  // user A could write chat messages to user B's analysis via the persist
  // step at the end of the stream. We return 404 (not 403) to avoid leaking
  // that the resource exists.
  //
  // Note: streaming itself doesn't read analysis data — the analysisId is
  // only used to persist the user/assistant message pair. So we only need
  // to gate the persist path. We do the check up-front so we can fail fast
  // with a clean HTTP 404 instead of an SSE error event mid-stream.
  let verifiedAnalysisId: string | null = null;
  if (body.analysisId) {
    const analysis = await verifyAnalysisOwnership(
      body.analysisId,
      userId,
      { select: { id: true, userId: true } },
      body.shareToken,
    );
    if (!analysis) {
      return new Response(
        "data: " + JSON.stringify({ error: "Analysis not found" }) + "\n\n",
        {
          status: 404,
          headers: { "Content-Type": "text/event-stream" },
        },
      );
    }
    verifiedAnalysisId = analysis.id;
  }

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
  const langInstruction = language === "vi"
    ? "\n\nTrả lời bằng tiếng Việt. Giữ nguyên code, file paths, và thuật ngữ kỹ thuật bằng tiếng Anh."
    : "\n\nRespond in English. Keep code, file paths, and technical terms as-is.";
  const llmMessages: AIMessage[] = [
    { role: "system", content: systemPrompt + langInstruction },
    ...history.slice(-10).map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user", content: message },
  ];

  const temperature = personality?.temperature ?? 0.7;
  const maxTokens = personality?.maxTokens && personality.maxTokens > 0 ? personality.maxTokens : 4096;

  // P3.1: planInfo is hoisted to the top of the handler — streamAI() will
  // throw TokenBudgetExceededError synchronously before opening the
  // connection if the user is over their monthly limit.

  // P3.2: load admin's fallback chain ONLY when the resolved provider came
  // from Platform AI (admin's key). BYOK users skip the chain — different
  // providers would require different keys the user doesn't have.
  // Heuristic: aiMode="platform" OR explicit platformProvider selection
  // (and no BYOK client apiKey in `effectiveProvider`) → Platform AI.
  const usedPlatformAI = body.aiMode === "platform" || (!!body.platformProvider && !effectiveProvider?.apiKey);
  const fallbacks = usedPlatformAI ? await getFallbackChain() : [];

  // Build the ordered list of provider configs to try: primary first, then
  // each fallback (with admin's stored key resolved by getFallbackChain).
  // Each fallback uses a tighter per-attempt timeout so 3 attempts fit in
  // the 60s Vercel Hobby budget.
  const FALLBACK_TIMEOUT_SEC = 20;
  const providersToTry: AIProviderConfig[] = finalProvider ? [finalProvider] : [];
  for (const fb of fallbacks) {
    providersToTry.push({
      providerId: fb.providerId,
      apiKey: fb.apiKey || finalProvider?.apiKey || "",
      baseUrl: fb.baseUrl || "",
      model: fb.model,
      temperature: finalProvider?.temperature,
      maxTokens: finalProvider?.maxTokens,
      timeout: FALLBACK_TIMEOUT_SEC,
    });
  }

  // Create SSE stream using the unified streamAI() generator
  // P3.2: iterates [primary, ...fallbacks]. On a retryable error (402/429/
  // 5xx/timeout) BEFORE any chunks have been yielded, switches to the next
  // provider. If chunks were already sent, surfaces the error to the client
  // (we can't take back chunks already delivered).
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let fullReply = "";
      let lastError: string | undefined;
      let lastProviderUsed: AIProviderConfig | undefined = providersToTry[0];
      let attemptsRemaining = providersToTry.length;

      for (const provider of providersToTry) {
        attemptsRemaining -= 1;
        lastProviderUsed = provider;
        fullReply = "";
        try {
          for await (const chunk of streamAI(provider, llmMessages, {
            temperature,
            maxTokens,
            // P3.2: tighter timeout for fallback providers (not the primary).
            timeout: provider === finalProvider ? undefined : FALLBACK_TIMEOUT_SEC,
            // P3.1: budget enforcement. streamAI() runs the pre-flight check
            // before fetch() and throws TokenBudgetExceededError if blocked.
            userId: userId ?? undefined,
            plan: planInfo.plan,
          })) {
            fullReply += chunk;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
          }

          // If we got content, we're done
          if (fullReply.trim()) {
            break;
          }

          // Empty response — try next provider if any remain.
          if (attemptsRemaining > 0) {
            console.warn(`[/api/chat/stream] Empty stream from ${provider.providerId}/${provider.model}; trying next fallback.`);
          }
        } catch (err: any) {
          // P3.1: budget-exceeded — send a structured error event so the
          // client can show an upgrade CTA. Never retry.
          if (err instanceof TokenBudgetExceededError) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              error: "Token budget exceeded",
              budget: {
                used: err.status.used,
                limit: err.status.limit,
                remaining: err.status.remaining,
                exceeded: true,
                unlimited: err.status.unlimited,
                resetsAt: err.status.resetsAt.toISOString(),
                retryAfterMs: err.retryAfterMs,
              },
              upgradeUrl: "/?view=settings",
            })}\n\n`));
            controller.close();
            return;
          }
          lastError = err?.message || "Stream failed";
          console.warn(`[/api/chat/stream] Provider ${provider.providerId}/${provider.model} error:`, lastError);

          // If we've already streamed chunks to the client, we can't safely
          // retry on another provider — the user would see concatenated /
          // duplicated output. Surface the error and stop.
          if (fullReply.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: lastError })}\n\n`));
            controller.close();
            return;
          }

          // No chunks sent yet. Decide whether to retry on the next provider.
          if (attemptsRemaining > 0 && shouldFallback(lastError ?? "")) {
            // Continue to next provider in the chain.
            continue;
          }

          // Non-retryable error or no more providers — send error and stop.
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: lastError })}\n\n`));
          controller.close();
          return;
        }
      }

      // Send done signal with debug metadata (if requested)
      const totalMs = Date.now() - requestStart;
      const doneData: any = { done: true, reply: fullReply };
      if (body.debug) {
        // Estimate tokens (rough: 1 token ≈ 4 chars)
        const inputTokens = Math.ceil((systemPrompt.length + message.length + history.map(h => h.content).join("").length) / 4);
        const outputTokens = Math.ceil(fullReply.length / 4);

        // Build finalPrompt (for Prompt tab — shows the assembled pipeline)
        const finalPrompt = llmMessages.map((m) => `[${m.role}]\n${m.content}`).join("\n\n---\n\n");

        doneData.debug = {
          // Full snapshot (for DeveloperConsole tabs)
          // P3.2: reflect the actual provider that handled the call (may be
          // a fallback if the primary 402'd / 5xx'd).
          requestId,
          timestamp: requestStart,
          provider: lastProviderUsed?.providerId ?? finalProvider?.providerId ?? "unknown",
          model: lastProviderUsed?.model ?? finalProvider?.model ?? "unknown",
          personality: personality?.name ?? "Default (CTO)",
          temperature,
          maxTokens,
          streaming: true,
          contextWindow: 128000,
          systemPrompt: systemPrompt + langInstruction,
          userPrompt: message,
          repositoryContext: "",
          retrievedChunks: [],
          finalPrompt,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          queueMs: 0,
          generationMs: totalMs,
          totalMs,
          capabilities: {
            vision: (lastProviderUsed?.providerId ?? finalProvider?.providerId) === "gemini" || (lastProviderUsed?.providerId ?? finalProvider?.providerId) === "openai",
            toolCalling: true,
            functionCalling: true,
            reasoning: (lastProviderUsed?.providerId ?? finalProvider?.providerId) === "openai",
          },
          rawResponse: fullReply,
          formattedResponse: fullReply,
          // Log (for Logs tab)
          log: {
            id: requestId,
            timestamp: requestStart,
            requestId,
            provider: lastProviderUsed?.providerId ?? finalProvider?.providerId ?? "unknown",
            model: lastProviderUsed?.model ?? finalProvider?.model ?? "unknown",
            personality: personality?.name ?? "Default (CTO)",
            durationMs: totalMs,
            queueMs: 0,
            generationMs: totalMs,
            status: lastError ? "error" : "success",
            statusCode: lastError ? 500 : 200,
            error: lastError,
            // P3.2: total attempts = primary + fallbacks tried.
            retryCount: Math.max(0, providersToTry.length - attemptsRemaining - 1),
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
          },
        };
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneData)}\n\n`));

      // Persist to DB (P3.7: only if ownership/share token was verified up-front)
      if (verifiedAnalysisId && fullReply.trim()) {
        try {
          await db.chatMessage.create({
            data: { analysisId: verifiedAnalysisId, role: "user", content: message },
          });
          await db.chatMessage.create({
            data: { analysisId: verifiedAnalysisId, role: "assistant", content: fullReply },
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
