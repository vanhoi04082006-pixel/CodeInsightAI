// POST /api/analyze/ai-pass — Run a single AI pass for an analysis
// Each pass runs in its own request (<60s, Hobby-compatible)
// Updates DB with partial results after each pass
import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { callAI, type AIMessage, TokenBudgetExceededError } from "@/lib/ai-client";
import { getUserPlanInfo } from "@/lib/billing/token-budget";
import { sequenceRoadmap } from "@/lib/roadmap-sequencer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55; // Under 60s Hobby limit

// Wave 6 Phase 1: added "overview" pass (executive decision intelligence).
type PassType = "overview" | "summary" | "security" | "architecture" | "quality" | "priorities" | "performance" | "bestPractices" | "duplicates";

const MODEL_MAX_TOKENS: Record<string, number> = {
  "gpt-5-nano": 1000, "gpt-4.1-nano": 1500, "gpt-4o-mini": 2000,
  "gpt-5-mini": 3000, "gpt-4.1-mini": 4000, "claude-sonnet-4-5": 4000,
  "deepseek-chat": 3000, "grok-4-fast-reasoning": 2000, "qwen3-coder-flash": 3000,
};

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // P3.1: hoist passType out of the try block so the outer catch handler can
  // include it in the 429 budget-exceeded response.
  let passType: PassType | undefined;

  try {
    const body = await req.json();
    const parsed = body as {
      analysisId: string; passType: PassType; language?: string;
      platformProvider?: string; platformModel?: string;
      provider?: { providerId: string; apiKey: string; baseUrl: string; model: string };
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

    // 1. BYOK — client-provided API key (Custom mode)
    if (provider?.apiKey) {
      aiConfig = {
        providerId: provider.providerId,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl || "",
        model: provider.model || "",
        temperature: 0.7, maxTokens: 4096, timeout: 50,
      };
    }

    // 2. Platform AI — admin's default
    if (!aiConfig && platformProvider) {
      aiConfig = await getPlatformAIProvider(platformProvider, platformModel);
    }
    if (!aiConfig) aiConfig = await getPlatformAIConfig();

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
        } catch {}
      }
    }

    if (!aiConfig) {
      return NextResponse.json({ error: "No AI provider available", passType, status: "skipped" });
    }

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

    const maxTokens = (MODEL_MAX_TOKENS as any)[aiConfig?.model] ?? 2000;
    const langInstruction = lang === "vi"
      ? "\n\nQUAN TRỌNG: Trả lời bằng tiếng Việt. Giữ nguyên code, file paths, thuật ngữ kỹ thuật bằng tiếng Anh."
      : "\n\nIMPORTANT: Respond in English. Keep code, file paths, and technical terms as-is.";

    const messages: AIMessage[] = [
      { role: "system", content: "You are a Senior Staff Engineer. Respond in valid JSON only, no markdown fences, no explanation. Start with { and end with }." + langInstruction },
      { role: "user", content: prompt },
    ];

    // P3.1: look up the user's plan + role for token-budget enforcement.
    // callAI() will throw TokenBudgetExceededError synchronously before the
    // fetch() if the user is over their monthly limit. Caught below → 429.
    const planInfo = await getUserPlanInfo(userId);

    // Run AI pass (2 attempts: json_object → plain text)
    let result: any = null;
    try {
      const aiResult = await callAI(aiConfig, messages, {
        temperature: 0.3, maxTokens, timeout: 45,
        responseFormat: "json_object",
        userId,
        plan: planInfo.plan,
      });
      if (aiResult.content) result = safeJsonParse(aiResult.content);
    } catch (e: any) {
      // P3.1: budget-exceeded propagates immediately — don't retry with half tokens.
      if (e instanceof TokenBudgetExceededError) throw e;
      const errMsg = e?.message || "";
      if (errMsg.includes("402") || errMsg.includes("credits")) {
        // Retry with half tokens
        try {
          const aiResult = await callAI(aiConfig, messages, {
            temperature: 0.3, maxTokens: Math.min(1500, Math.floor(maxTokens / 2)), timeout: 45,
            responseFormat: "json_object",
            userId,
            plan: planInfo.plan,
          });
          if (aiResult.content) result = safeJsonParse(aiResult.content);
        } catch (e2: any) {
          if (e2 instanceof TokenBudgetExceededError) throw e2;
        }
      }
    }

    if (!result) {
      // Attempt 2: without response_format
      try {
        const aiResult = await callAI(aiConfig, messages, {
          temperature: 0.3, maxTokens, timeout: 45,
          userId,
          plan: planInfo.plan,
        });
        if (aiResult.content) result = safeJsonParse(aiResult.content);
      } catch (e: any) {
        if (e instanceof TokenBudgetExceededError) throw e;
        console.warn(`[ai-pass] ${passType} failed:`, e?.message?.slice(0, 200));
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
        report, // return updated report so frontend can update
      });
    } else {
      return NextResponse.json({
        passType, status: "failed",
        error: "AI returned no valid result",
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
