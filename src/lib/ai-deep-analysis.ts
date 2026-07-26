// CodeInsight AI — Deep AI Analysis (9-pass)
//
// When an AI provider is available (BYOK or Platform AI), runs LLM passes
// to generate a comprehensive analysis:
// 0. Overview (NEW — Wave 6 Phase 1) — executive-level decision intelligence
// 1. Executive Summary (business-focused)
// 2. Deep Security Review (with AI-generated fix code)
// 3. Architecture Analysis (pattern evaluation + improvements)
// 4. Code Quality Review (complex files + refactored code)
// 5. Performance Deep Dive (AI review of each perf issue + fix code)
// 6. Best Practices Audit (framework-specific best practices)
// 7. Priorities + Roadmap (ranked by business impact)
// 8. Duplicate Code Analysis (AI-powered — replaces static function-name match)
//
// Wave 6 Phase 1 (AI-first): every actionable pass now produces ENTERPRISE-GRADE
// STRUCTURED OUTPUT — evidence (file:line refs), confidence (0-1), fixPlan (steps),
// severity (AI-assigned). A new "overview" pass provides executive decision intelligence.
// All new fields are OPTIONAL on DeepAnalysisResult — existing data without them
// still renders fine.

import type { AnalysisReport, AIFinding, AIOverview, EnhancedPriority, RoadmapPhase } from "@/lib/types";
import type { ParsedRepository } from "@/lib/repo-parser";
import { callAI, type AIProviderConfig, type AIMessage } from "@/lib/ai-client";
import { buildPromptForPass, type PassType } from "@/lib/ai-deep-analysis-helpers";

export interface DeepAnalysisResult {
  badge: "deep-ai" | "ai-enhanced" | "static-only";
  executiveSummary: string;
  // Wave 6 Phase 1: enterprise-grade structured findings (evidence + confidence + fixPlan + severity)
  aiOverview?: AIOverview;                                     // NEW — executive decision intelligence
  securityReview: AIFinding[];
  architectureReview: {
    strengths: string[];
    weaknesses: string[];
    suggestions: Array<{
      title: string;
      description: string;
      effort: string;
      evidence?: string[];
      confidence?: number;
      severity?: "critical" | "high" | "medium" | "low";
    }>;
  };
  codeQualityReview: AIFinding[];
  performanceReview: AIFinding[];
  bestPracticesAudit: {
    framework: string;
    passed: string[];
    failed: Array<{
      practice: string;
      recommendation: string;
      evidence?: string[];
      confidence?: number;
      severity?: "critical" | "high" | "medium" | "low";
    }>;
    score: number;
  };
  // Phase 2 (P2.3): Enhanced Roadmap Agent — priorities now carry effort/phase/deps,
  // roadmap phases are typed P0-P3, and a CTO-facing executiveNote is attached.
  // All new fields are OPTIONAL — backward-compatible with existing data.
  priorities: EnhancedPriority[];
  roadmap: RoadmapPhase[];
  executiveNote?: string;                                       // NEW (P2.3) — CTO narrative
  duplicateAnalysis?: Array<{
    files: string[];
    type: string;
    description: string;
    recommendation: string;
    estimatedLinesSaved: number;
    evidence?: string[];
    confidence?: number;
  }>;
}

/**
 * Run 9-pass deep analysis on a repository report.
 * Returns null if the AI call fails (non-fatal — keeps static report).
 */
export async function runDeepAnalysis(
  parsed: ParsedRepository,
  report: AnalysisReport,
  provider: AIProviderConfig,
  language: string = "en"
): Promise<DeepAnalysisResult | null> {
  try {
    // Pass 0 + 1 + 7: Overview + Executive Summary + Priorities (parallel — independent)
    const [overviewResult, summaryResult, prioritiesResult] = await Promise.all([
      runPass(provider, "overview", parsed, report, language),
      runPass(provider, "summary", parsed, report, language),
      runPass(provider, "priorities", parsed, report, language),
    ]);

    // Pass 2 + 3 + 4: Security + Architecture + Code Quality (parallel)
    const [securityResult, archResult, qualityResult] = await Promise.all([
      runPass(provider, "security", parsed, report, language),
      runPass(provider, "architecture", parsed, report, language),
      runPass(provider, "quality", parsed, report, language),
    ]);

    // Pass 5 + 6: Performance Deep Dive + Best Practices Audit (parallel)
    const [perfResult, bestPracticesResult] = await Promise.all([
      runPass(provider, "performance", parsed, report, language),
      runPass(provider, "bestPractices", parsed, report, language),
    ]);

    // Pass 8: Duplicate Code Analysis (AI-powered — replaces static function-name match)
    const duplicateResult = await runPass(provider, "duplicates", parsed, report, language);

    const result: DeepAnalysisResult = {
      badge: "deep-ai",
      executiveSummary: summaryResult?.summary || report.summary,
      aiOverview: overviewResult || undefined,
      securityReview: securityResult?.reviews || [],
      architectureReview: archResult || { strengths: [], weaknesses: [], suggestions: [] },
      codeQualityReview: qualityResult?.reviews || [],
      performanceReview: perfResult?.reviews || [],
      bestPracticesAudit: bestPracticesResult || {
        framework: parsed.frameworks[0]?.name || "Unknown",
        passed: [],
        failed: [],
        score: 0,
      },
      priorities: prioritiesResult?.priorities || [],
      roadmap: prioritiesResult?.roadmap || [],
      executiveNote: prioritiesResult?.executiveNote,           // P2.3 — CTO narrative
      duplicateAnalysis: duplicateResult?.duplicates || [],
    };

    return result;
  } catch (e) {
    console.error("[deep-analysis] Error:", e);
    return null;
  }
}

// Model-specific maxTokens — balances quality vs cost
const MODEL_MAX_TOKENS: Record<string, number> = {
  "gpt-5-nano": 1000,
  "gpt-4.1-nano": 1500,
  "gpt-4o-mini": 2000,
  "gpt-5-mini": 3000,
  "gpt-4.1-mini": 4000,
  "grok-4-fast-reasoning": 2000,
  "deepseek-chat": 3000,
  "qwen3-coder-flash": 3000,
};

function getMaxTokensForModel(model: string): number {
  return MODEL_MAX_TOKENS[model] ?? 2000; // default 2000
}

async function runPass(
  provider: AIProviderConfig,
  passType: PassType,
  parsed: ParsedRepository,
  report: AnalysisReport,
  language: string = "en"
): Promise<any> {
  const maxTokens = getMaxTokensForModel(provider.model);
  // Wave 6 Phase 1: prompts now live in ai-deep-analysis-helpers.ts (single source of truth)
  // and request structured output: evidence + confidence + fixPlan + severity.
  const prompt = buildPromptForPass(passType, parsed as any, report);
  const langInstruction = language === "vi"
    ? "\n\nQUAN TRỌNG: Trả lời bằng tiếng Việt (Tiếng Việt). Giữ nguyên code, file paths, tên hàm, tên class, và thuật ngữ kỹ thuật bằng tiếng Anh. Viết tất cả giải thích và mô tả bằng tiếng Việt."
    : "\n\nIMPORTANT: Respond in English. Keep code, file paths, function names, class names, and technical terms as-is. Write all explanations and descriptions in English.";
  const messages: AIMessage[] = [
    { role: "system", content: "You are a Senior Staff Engineer. Respond in valid JSON only, no markdown fences, no explanation. Start your response with { and end with }." + langInstruction },
    { role: "user", content: prompt },
  ];

  // Attempt 1: with response_format: json_object (some providers support this)
  // maxTokens: model-specific (balances quality vs cost)
  try {
    const result = await callAI(provider, messages, {
      temperature: 0.3,
      maxTokens,
      timeout: 60,
      responseFormat: "json_object",
    });

    if (result.content) {
      const parsed = safeJsonParse(result.content);
      if (parsed) {
        console.log(`[deep-analysis] Pass ${passType}: OK (json_object mode, ${maxTokens} tokens)`);
        return parsed;
      }
    }
  } catch (e: any) {
    const errMsg = e?.message || "";
    console.warn(`[deep-analysis] Pass ${passType} attempt 1 (${maxTokens} tokens) failed:`, errMsg.slice(0, 200));

    // If 402 (credits exhausted), retry with half maxTokens
    if (errMsg.includes("402") || errMsg.includes("credits") || errMsg.includes("afford")) {
      const fallbackTokens = Math.min(1500, Math.floor(maxTokens / 2));
      console.warn(`[deep-analysis] Pass ${passType}: 402 credits error — retrying with ${fallbackTokens} tokens`);
      try {
        const result = await callAI(provider, messages, {
          temperature: 0.3,
          maxTokens: fallbackTokens,
          timeout: 60,
          responseFormat: "json_object",
        });
        if (result.content) {
          const parsed = safeJsonParse(result.content);
          if (parsed) {
            console.log(`[deep-analysis] Pass ${passType}: OK (json_object mode, 1500 tokens fallback)`);
            return parsed;
          }
        }
      } catch (e2: any) {
        console.warn(`[deep-analysis] Pass ${passType} 402-retry failed:`, e2?.message?.slice(0, 200));
      }
    }
  }

  // Attempt 2: without response_format (fallback for providers that don't support it)
  try {
    const result = await callAI(provider, messages, {
      temperature: 0.3,
      maxTokens,
      timeout: 60,
      // No responseFormat — let AI return plain text, we extract JSON
    });

    if (result.content) {
      const parsed = safeJsonParse(result.content);
      if (parsed) {
        console.log(`[deep-analysis] Pass ${passType}: OK (plain text mode)`);
        return parsed;
      }
      console.warn(`[deep-analysis] Pass ${passType}: JSON parse failed. Content: ${result.content.slice(0, 200)}`);
    } else {
      console.warn(`[deep-analysis] Pass ${passType}: Empty response`);
    }
  } catch (e: any) {
    console.error(`[deep-analysis] Pass ${passType} attempt 2 failed:`, e?.message?.slice(0, 200));
  }

  return null;
}

/**
 * Robust JSON parser — handles:
 * - Plain JSON
 * - JSON wrapped in ```json ... ``` fences
 * - JSON embedded in text (extracts first { ... } block)
 * - Trailing commas (removed)
 */
function safeJsonParse(text: string): any | null {
  if (!text) return null;
  let cleaned = text.trim();

  // Remove markdown fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  // Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch {}

  // Try extracting first { ... } block
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const jsonStr = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(jsonStr);
    } catch {}
    // Remove trailing commas
    try {
      return JSON.parse(jsonStr.replace(/,(\s*[}\]])/g, "$1"));
    } catch {}
  }

  // Try first [ ... ] block (for arrays)
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1));
    } catch {}
  }

  return null;
}
