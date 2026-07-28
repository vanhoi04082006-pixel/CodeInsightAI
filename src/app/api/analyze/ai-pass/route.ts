// POST /api/analyze/ai-pass — Run a single AI pass for an analysis
// Each pass runs in its own request (<60s, Hobby-compatible)
// Updates DB with partial results after each pass
import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { callAI, type AIMessage, TokenBudgetExceededError } from "@/lib/ai-client";
import { callAIWithFallback, getFallbackChain } from "@/lib/ai-fallback";
import { getUserPlanInfo } from "@/lib/billing/token-budget";
import {
  enforceRateLimit,
  rateLimit429Body,
  rateLimitHeaders,
  retryAfterSeconds,
  maybeCleanupOldBuckets,
} from "@/lib/rate-limiter";
import { sequenceRoadmap } from "@/lib/roadmap-sequencer";
import { loadPolicies } from "@/lib/policies/policy-loader";
import {
  evaluatePolicies,
  hasBlockingViolation,
  blockingViolations,
} from "@/lib/policies/evaluator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55; // Under 60s Hobby limit

// Wave 6 Phase 1: added "overview" pass (executive decision intelligence).
type PassType = "overview" | "summary" | "security" | "architecture" | "quality" | "priorities" | "performance" | "bestPractices" | "duplicates";

const MODEL_MAX_TOKENS: Record<string, number> = {
  "gpt-5-nano": 2000, "gpt-4.1-nano": 3000, "gpt-4o-mini": 4000,
  "gpt-5-mini": 6000, "gpt-4.1-mini": 8000, "claude-sonnet-4-5": 8000,
  "deepseek-chat": 6000, "grok-4-fast-reasoning": 4000, "qwen3-coder-flash": 6000,
};

// Complex passes need more tokens but NOT too much (causes 504 timeout).
// Reduced from 2.0 to 1.5 — AI responds faster, less likely to timeout.
const PASS_TOKEN_BOOST: Record<string, number> = {
  security: 1.5,      // 5 issues × structured fields
  quality: 1.5,       // 5 bugs × structured fields
  performance: 1.5,   // 5 issues × structured fields
  priorities: 1.5,    // enhanced roadmap
  architecture: 1.5,  // strengths/weaknesses/suggestions
  duplicates: 1.5,    // duplicate analysis
  bestPractices: 1.5, // passed/failed lists
  overview: 1.0,      // executive summary
  summary: 1.0,       // 2-3 sentence summary
};

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // P3.1 + P3.3: hoist the plan/role lookup to the top of the handler so
  // both the hourly rate-limit check (P3.3) and the monthly token-budget
  // enforcement inside callAIWithFallback (P3.1) share the same lookup.
  // Single indexed findUnique — ~3ms.
  const planInfo = await getUserPlanInfo(userId);

  // P3.3: per-user hourly rate limit (DB-backed — survives Vercel serverless
  // cold-starts). Shares the "analysis" bucket with /api/analyze — a single
  // repo analysis runs 9 AI passes, so we don't want to double-count by
  // giving ai-pass its own bucket. Check happens BEFORE the expensive AI
  // call (before tokens are spent).
  const rl = await enforceRateLimit(userId, planInfo.plan, "analysis");
  if (rl.blocked) {
    return NextResponse.json(rateLimit429Body(rl.status!, "analysis"), {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds(rl.status)),
        ...rateLimitHeaders(rl.status),
      },
    });
  }
  // Opportunistic cleanup of stale buckets (~1% of requests, fire-and-forget).
  maybeCleanupOldBuckets();

  // P3.1: hoist passType out of the try block so the outer catch handler can
  // include it in the 429 budget-exceeded response.
  let passType: PassType | undefined;

  try {
    const body = await req.json();
    const parsed = body as {
      analysisId: string; passType: PassType; language?: string;
      platformProvider?: string; platformModel?: string;
      provider?: { providerId: string; apiKey: string; baseUrl: string; model: string; maxTokens?: number; temperature?: number; timeout?: number };
    };
    const { analysisId, language, platformProvider, platformModel, provider } = parsed;
    passType = parsed.passType;

    if (!analysisId || !passType) {
      return NextResponse.json({ error: "analysisId and passType required" }, { status: 400 });
    }

    // Verify ownership
    const analysis = await db.analysis.findUnique({
      where: { id: analysisId },
      select: { userId: true, report: true, parsedData: true, aiStatus: true },
    });
    if (!analysis || analysis.userId !== userId) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    const report = JSON.parse(analysis.report);
    const parsedRepo = analysis.parsedData ? JSON.parse(analysis.parsedData) : null;
    const lang = language || "en";

    // Resolve AI provider — priority: BYOK (client) → Platform → DB credential
    const { getPlatformAIProvider, getPlatformAIConfig } = await import("@/lib/platform-ai");
    const { decrypt } = await import("@/lib/crypto");

    let aiConfig: any = null;
    // P3.2: track whether the resolved config came from Platform AI (admin's
    // key). If so, the admin's fallback chain applies. BYOK users (their own
    // key) do NOT use the admin's fallback chain — different providers would
    // require different keys the user doesn't have.
    let usedPlatformAI = false;

    // 1. BYOK — client-provided API key (Custom mode)
    if (provider?.apiKey) {
      aiConfig = {
        providerId: provider.providerId,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl || "",
        model: provider.model || "",
        temperature: provider.temperature ?? 0.7,
        maxTokens: provider.maxTokens ?? 4096,
        timeout: provider.timeout ?? 50,
      };
      usedPlatformAI = false;
    }

    // 2. Platform AI — admin's default
    if (!aiConfig && platformProvider) {
      aiConfig = await getPlatformAIProvider(platformProvider, platformModel);
      // Override maxTokens if user configured it in the mode toggle
      if (aiConfig && body.platformMaxTokens !== undefined) {
        const userMax = body.platformMaxTokens;
        (aiConfig as any).maxTokens = (userMax && userMax > 0) ? userMax : 4096;
      }
      usedPlatformAI = !!aiConfig;
    }
    if (!aiConfig) {
      aiConfig = await getPlatformAIConfig();
      usedPlatformAI = !!aiConfig;
    }

    // 3. BYOK — from DB (encrypted credential)
    if (!aiConfig) {
      const cred = await db.providerCredential.findFirst({
        where: { userId, enabled: true },
        orderBy: { updatedAt: "desc" },
      });
      if (cred) {
        try {
          aiConfig = {
            providerId: cred.providerId, apiKey: decrypt(cred.encryptedApiKey),
            baseUrl: cred.baseUrl, model: cred.model,
            temperature: cred.temperature ?? 0.7, maxTokens: cred.maxTokens ?? 4096, timeout: 50,
          };
          usedPlatformAI = false;
        } catch {}
      }
    }

    if (!aiConfig) {
      return NextResponse.json({ error: "No AI provider available", passType, status: "skipped" });
    }

    // P3.2: load admin's fallback chain ONLY if we resolved a Platform AI
    // config (admin's key). Empty array for BYOK → degrades to legacy behavior.
    const fallbacks = usedPlatformAI ? await getFallbackChain() : [];

    // Build prompt for this pass
    const { buildPromptForPass } = await import("@/lib/ai-deep-analysis-helpers");
    const prompt = buildPromptForPass(passType, parsedRepo || {
      owner: report.repoOwner, name: report.repoName, url: report.repoUrl,
      totalFiles: report.totalFiles, totalLines: report.totalLines,
      languages: report.languages, frameworks: report.frameworks,
      files: report.files.map((f: any) => ({
        path: f.path, language: f.language, lines: f.lines,
        complexity: f.complexity, description: f.description,
        imports: [], exports: [], functions: [], classes: [], components: [], routes: [],
      })),
    }, report);

    // ── maxTokens resolution priority ──
    // 1. User-configured maxTokens on the provider (BYOK) — respects what
    //    user set in Providers view. -1 or 0 = unlimited → use model default.
    // 2. Model-specific default from MODEL_MAX_TOKENS table.
    // 3. Fallback 3000.
    // Then apply PASS_TOKEN_BOOST multiplier (complex passes need more tokens).
    const userMaxTokens = (provider as any)?.maxTokens || (aiConfig as any)?.maxTokens;
    const modelDefault = (MODEL_MAX_TOKENS as any)[aiConfig?.model] ?? 3000;
    const baseMaxTokens = (userMaxTokens && userMaxTokens > 0) ? userMaxTokens : modelDefault;
    const boost = PASS_TOKEN_BOOST[passType ?? ""] ?? 1.0;
    const maxTokens = Math.round(baseMaxTokens * boost);
    // Cap at 8000 to avoid exceeding model context windows on small models
    const cappedMaxTokens = Math.min(maxTokens, 8000);

    // P3.5: Policy engine — evaluate enabled policies against this AI call.
    // Runs AFTER provider resolution (so we know providerId/model) and AFTER
    // maxTokens is computed (so the `max-tokens-per-call` warn-and-cap rule
    // can clamp it). BLOCK-severity → 403 with violation details. WARN-
    // severity (only `max-tokens-per-call` today) → cap maxTokens to the
    // policy's configured max and continue.
    //
    // Fail-open: if loadPolicies() throws (DB error), `policies` is `[]`
    // and evaluatePolicies returns no violations — the call proceeds.
    let effectiveMaxTokens = cappedMaxTokens;
    const policies = await loadPolicies();
    if (policies.length > 0) {
      const violations = evaluatePolicies(policies, {
        providerId: aiConfig.providerId,
        model: aiConfig.model,
        maxTokens: cappedMaxTokens,
        userId,
        plan: planInfo.plan,
      });
      if (hasBlockingViolation(violations)) {
        return NextResponse.json(
          {
            error: "Policy violation",
            passType: passType ?? null,
            status: "blocked",
            violations: blockingViolations(violations),
          },
          { status: 403 },
        );
      }
      // Apply WARN-severity caps (currently only `max-tokens-per-call`).
      const tokenWarn = violations.find(
        (v) => v.policyType === "max-tokens-per-call" && v.severity === "warn",
      );
      if (tokenWarn) {
        const policy = policies.find((p) => p.id === tokenWarn.policyId);
        const cap = policy?.config?.maxTokens ?? 4000;
        effectiveMaxTokens = Math.min(cappedMaxTokens, cap);
        if (effectiveMaxTokens !== cappedMaxTokens) {
          console.warn(
            `[policies] ${passType} maxTokens capped ${cappedMaxTokens} → ${effectiveMaxTokens}`,
          );
        }
      }
    }

    const langInstruction = lang === "vi"
      ? "\n\nQUAN TRỌNG: Trả lời bằng tiếng Việt. Giữ nguyên code, file paths, thuật ngữ kỹ thuật bằng tiếng Anh."
      : "\n\nIMPORTANT: Respond in English. Keep code, file paths, and technical terms as-is.";

    const messages: AIMessage[] = [
      { role: "system", content: "You are a Senior Staff Engineer. Respond in valid JSON only, no markdown fences, no explanation. Start with { and end with }." + langInstruction },
      { role: "user", content: prompt },
    ];

    // P3.1: planInfo is hoisted to the top of the handler — callAIWithFallback
    // (and the underlying callAI) will throw TokenBudgetExceededError
    // synchronously before fetch() if the user is over their monthly limit.
    // Caught below → 429.

    // P3.2: Run AI pass via callAIWithFallback (handles 402/429/5xx by
    // switching providers in the admin's fallback chain).
    //
    // Strategy:
    //   Attempt 1: callAIWithFallback with responseFormat=json_object.
    //     - For Platform AI: tries primary + each fallback provider in order.
    //     - For BYOK: empty fallbacks → degrades to single callAI() attempt.
    //     - The legacy 402-half-token retry is preserved ONLY when no
    //       fallback chain is configured (BYOK users whose own key 402s).
    //   Attempt 2 (if attempt 1 produced no parseable JSON): same chain
    //     without responseFormat — some providers reject json_object mode.
    let result: any = null;
    let providerUsed: string | undefined;
    let attemptedProviders: any[] | undefined;

    // ── Attempt 1: json_object response format ──
    try {
      const aiResult = await callAIWithFallback(aiConfig, fallbacks, messages, {
        temperature: 0.3, maxTokens: effectiveMaxTokens, timeout: 55,
        responseFormat: "json_object",
        userId,
        plan: planInfo.plan,
        audit: { userId, analysisId, passType },
      });
      if (aiResult.content) result = safeJsonParse(aiResult.content);
      providerUsed = aiResult.providerUsed;
      attemptedProviders = aiResult.attemptedProviders;
    } catch (e: any) {
      // P3.1: budget-exceeded propagates immediately — don't retry with half tokens.
      if (e instanceof TokenBudgetExceededError) throw e;
      // P3.2: legacy 402-half-token retry — only when no fallback chain is
      // configured. With a chain, callAIWithFallback already exhausted the
      // available providers, so retrying with half tokens on the SAME
      // provider won't help (the provider is genuinely out of credits).
      if (fallbacks.length === 0) {
        const errMsg = e?.message || "";
        if (errMsg.includes("402") || errMsg.includes("credits")) {
          try {
            const aiResult = await callAI(aiConfig, messages, {
              temperature: 0.3, maxTokens: Math.min(1500, Math.floor(effectiveMaxTokens / 2)), timeout: 55,
              responseFormat: "json_object",
              userId,
              plan: planInfo.plan,
              audit: { userId, analysisId, passType },
            });
            if (aiResult.content) result = safeJsonParse(aiResult.content);
            providerUsed = aiResult.providerId;
          } catch (e2: any) {
            if (e2 instanceof TokenBudgetExceededError) throw e2;
          }
        }
      }
    }

    // ── Attempt 2: without response_format (some providers reject json_object) ──
    // Use a stronger system prompt that explicitly forbids markdown fences.
    if (!result) {
      try {
        const fallbackMessages: AIMessage[] = [
          { role: "system", content: "You are a Senior Staff Engineer. Output ONLY valid JSON — no markdown, no code fences, no explanation. Start with { and end with }. Do NOT wrap in ```json blocks." + langInstruction },
          { role: "user", content: prompt },
        ];
        const aiResult = await callAIWithFallback(aiConfig, fallbacks, fallbackMessages, {
          temperature: 0.2, maxTokens: effectiveMaxTokens, timeout: 55,
          userId,
          plan: planInfo.plan,
          audit: { userId, analysisId, passType },
        });
        if (aiResult.content) {
          // Aggressive cleaning: strip markdown fences, extract first {...} block
          let cleaned = aiResult.content.trim();
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
          // If still has fences in middle, extract first { to last }
          const firstBrace = cleaned.indexOf("{");
          const lastBrace = cleaned.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleaned = cleaned.slice(firstBrace, lastBrace + 1);
          }
          result = safeJsonParse(cleaned);
          // Try one more: fix trailing commas
          if (!result) {
            result = safeJsonParse(cleaned.replace(/,(\s*[}\]])/g, "$1"));
          }
        }
        providerUsed = aiResult.providerUsed;
        attemptedProviders = aiResult.attemptedProviders;
      } catch (e: any) {
        if (e instanceof TokenBudgetExceededError) throw e;
        console.warn(`[ai-pass] ${passType} attempt 2 failed:`, e?.message?.slice(0, 200));
      }
    }

    // Update report with this pass result
    if (result) {
      updateReportWithPassResult(report, passType, result);

      // Check if all passes are done (Wave 6 Phase 1: 9 passes — overview added)
      const allPasses: PassType[] = ["overview", "summary", "security", "architecture", "quality", "priorities", "performance", "bestPractices", "duplicates"];
      const completedPasses = (report as any)._aiPassesCompleted || [];
      if (!completedPasses.includes(passType)) completedPasses.push(passType);
      (report as any)._aiPassesCompleted = completedPasses;

      const allDone = allPasses.every(p => completedPasses.includes(p));
      const aiStatus = allDone ? "done" : "pending";

      await db.analysis.update({
        where: { id: analysisId },
        data: {
          report: JSON.stringify(report),
          aiStatus,
        },
      });

      return NextResponse.json({
        passType, status: "done", result,
        completedPasses, totalPasses: allPasses.length,
        allDone: aiStatus === "done",
        // P3.2: surface which provider ultimately handled the call (may be a
        // fallback if the primary 402'd / 5xx'd). Useful for debugging.
        providerUsed: providerUsed ?? null,
        attemptedProviders: attemptedProviders ?? [],
        report, // return updated report so frontend can update
      });
    } else {
      // Include attempted providers + last error for debugging
      const lastError = attemptedProviders?.find(p => p.error)?.error;
      return NextResponse.json({
        passType, status: "failed",
        error: lastError || "AI returned no valid JSON after 2 attempts",
        providerUsed: providerUsed ?? null,
        attemptedProviders: attemptedProviders ?? [],
        maxTokens: effectiveMaxTokens,
      });
    }
  } catch (e: any) {
    // P3.1: budget-exceeded → 429 with structured budget payload.
    if (e instanceof TokenBudgetExceededError) {
      return NextResponse.json({
        error: "Token budget exceeded",
        message: `You've used ${e.status.used.toLocaleString()} / ${e.status.limit === -1 ? "∞" : e.status.limit.toLocaleString()} tokens this month. Upgrade your plan for more tokens.`,
        passType: passType ?? null,
        status: "blocked",
        budget: {
          used: e.status.used,
          limit: e.status.limit,
          remaining: e.status.remaining,
          exceeded: true,
          unlimited: e.status.unlimited,
          resetsAt: e.status.resetsAt.toISOString(),
          retryAfterMs: e.retryAfterMs,
        },
        upgradeUrl: "/?view=settings",
      }, { status: 429 });
    }
    console.error("[/api/analyze/ai-pass] Error:", e);
    return NextResponse.json({ error: e?.message || "AI pass failed" }, { status: 500 });
  }
}

function safeJsonParse(text: string): any | null {
  if (!text) return null;
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(cleaned); } catch {}
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    try { return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)); } catch {}
    try { return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1).replace(/,(\s*[}\]])/g, "$1")); } catch {}
  }
  return null;
}

function updateReportWithPassResult(report: any, passType: PassType, result: any) {
  if (!report.deepAnalysis) report.deepAnalysis = { badge: "deep-ai" };
  const deep = report.deepAnalysis;

  switch (passType) {
    case "overview":
      // Wave 6 Phase 1: executive-level decision intelligence (topRisks / quickWins / fixFirst / fastestScoreGain)
      deep.aiOverview = result;
      break;
    case "summary":
      deep.executiveSummary = result.summary || report.summary;
      report.aiEnhancement = { aiSummary: deep.executiveSummary, aiBadge: "ai-enhanced" };
      break;
    case "security":
      deep.securityReview = result.reviews || [];
      break;
    case "architecture":
      deep.architectureReview = result || { strengths: [], weaknesses: [], suggestions: [] };
      break;
    case "quality":
      deep.codeQualityReview = result.reviews || [];
      break;
    case "priorities": {
      // Phase 2 (P2.3): run the deterministic sequencer on AI output before
      // persisting. Validates dependsOn refs, breaks cycles, promotes
      // releasePhase when dependencies require it, re-sums effort per phase.
      // Never throws — failures degrade to warnings, input is preserved.
      const rawPriorities = result.priorities || [];
      const rawRoadmap = result.roadmap || [];
      const { sequencedPriorities, sequencedRoadmap, warnings } = sequenceRoadmap(
        rawPriorities,
        rawRoadmap,
      );
      if (warnings.length > 0) {
        console.warn("[roadmap-sequencer] warnings:", warnings);
        (report as any)._sequencerWarnings = warnings;
      }
      deep.priorities = sequencedPriorities;
      deep.roadmap = sequencedRoadmap;
      deep.executiveNote = result.executiveNote;
      break;
    }
    case "performance":
      deep.performanceReview = result.reviews || [];
      break;
    case "bestPractices":
      deep.bestPracticesAudit = result || { framework: "Unknown", passed: [], failed: [], score: 0 };
      break;
    case "duplicates":
      deep.duplicateAnalysis = result.duplicates || [];
      break;
  }
}
