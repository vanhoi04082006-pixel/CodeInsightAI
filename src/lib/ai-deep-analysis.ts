// CodeInsight AI — Deep AI Analysis (7-pass)
//
// When an AI provider is available (BYOK or Platform AI), runs 7 LLM passes
// to generate a comprehensive analysis:
// 1. Executive Summary (business-focused)
// 2. Deep Security Review (with AI-generated fix code)
// 3. Architecture Analysis (pattern evaluation + improvements)
// 4. Code Quality Review (complex files + refactored code)
// 5. Performance Deep Dive (AI review of each perf issue + fix code)  ← NEW
// 6. Best Practices Audit (framework-specific best practices)         ← NEW
// 7. Priorities + Roadmap (ranked by business impact)
//
// Total token cost: ~10000 tokens per analysis (vs ~500 for basic enhancement).
// This is why it's optional — users can disable via body.aiEnhance=false.

import type { AnalysisReport } from "@/lib/types";
import type { ParsedRepository } from "@/lib/repo-parser";
import { callAI, type AIProviderConfig, type AIMessage } from "@/lib/ai-client";

export interface DeepAnalysisResult {
  badge: "deep-ai" | "ai-enhanced" | "static-only";
  executiveSummary: string;
  securityReview: Array<{
    issue: string;
    rootCause: string;
    fixCode: string;
    impact: string;
  }>;
  architectureReview: {
    strengths: string[];
    weaknesses: string[];
    suggestions: Array<{ title: string; description: string; effort: string }>;
  };
  codeQualityReview: Array<{
    file: string;
    issues: string[];
    refactorSuggestion: string;
  }>;
  performanceReview: Array<{  // ← NEW
    issue: string;
    rootCause: string;
    fixCode: string;
    expectedImprovement: string;
  }>;
  bestPracticesAudit: {       // ← NEW
    framework: string;
    passed: string[];
    failed: Array<{ practice: string; recommendation: string }>;
    score: number;
  };
  priorities: Array<{ issue: string; businessImpact: string; recommendation: string }>;
  roadmap: Array<{ phase: string; tasks: string[] }>;
}

/**
 * Run 7-pass deep analysis on a repository report.
 * Returns null if the AI call fails (non-fatal — keeps static report).
 */
export async function runDeepAnalysis(
  parsed: ParsedRepository,
  report: AnalysisReport,
  provider: AIProviderConfig
): Promise<DeepAnalysisResult | null> {
  try {
    // Pass 1 + 7: Executive Summary + Priorities (parallel — independent)
    const [summaryResult, prioritiesResult] = await Promise.all([
      runPass(provider, "summary", parsed, report),
      runPass(provider, "priorities", parsed, report),
    ]);

    // Pass 2 + 3 + 4: Security + Architecture + Code Quality (parallel)
    const [securityResult, archResult, qualityResult] = await Promise.all([
      runPass(provider, "security", parsed, report),
      runPass(provider, "architecture", parsed, report),
      runPass(provider, "quality", parsed, report),
    ]);

    // Pass 5 + 6: Performance Deep Dive + Best Practices Audit (parallel)  ← NEW
    const [perfResult, bestPracticesResult] = await Promise.all([
      runPass(provider, "performance", parsed, report),
      runPass(provider, "bestPractices", parsed, report),
    ]);

    const result: DeepAnalysisResult = {
      badge: "deep-ai",
      executiveSummary: summaryResult?.summary || report.summary,
      securityReview: securityResult?.reviews || [],
      architectureReview: archResult || { strengths: [], weaknesses: [], suggestions: [] },
      codeQualityReview: qualityResult?.reviews || [],
      performanceReview: perfResult?.reviews || [],                          // ← NEW
      bestPracticesAudit: bestPracticesResult || {                           // ← NEW
        framework: parsed.frameworks[0]?.name || "Unknown",
        passed: [],
        failed: [],
        score: 0,
      },
      priorities: prioritiesResult?.priorities || [],
      roadmap: prioritiesResult?.roadmap || [],
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
  "claude-sonnet-4-5": 4000,
  "deepseek-chat": 3000,
  "grok-4-fast": 2000,
};

function getMaxTokensForModel(model: string): number {
  return MODEL_MAX_TOKENS[model] ?? 2000; // default 2000
}

async function runPass(
  provider: AIProviderConfig,
  passType: "summary" | "security" | "architecture" | "quality" | "priorities" | "performance" | "bestPractices",
  parsed: ParsedRepository,
  report: AnalysisReport
): Promise<any> {
  const maxTokens = getMaxTokensForModel(provider.model);
  const prompt = buildPrompt(passType, parsed, report);
  const messages: AIMessage[] = [
    { role: "system", content: "You are a Senior Staff Engineer. Respond in valid JSON only, no markdown fences, no explanation. Start your response with { and end with }." },
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

function buildPrompt(
  passType: string,
  parsed: ParsedRepository,
  report: AnalysisReport
): string {
  const repoInfo = `Repository: ${parsed.owner}/${parsed.name} (${parsed.totalFiles} files, ${parsed.totalLines.toLocaleString()} lines)
Primary language: ${parsed.languages[0]?.name ?? "Unknown"}
Frameworks: ${parsed.frameworks.map((f) => f.name).join(", ") || "None"}
Architecture: ${report.architecture.pattern}
Scores — Overall: ${report.scores.overall}, Security: ${report.scores.security}, Performance: ${report.scores.performance}, Architecture: ${report.scores.architecture}`;

  const topIssues = [
    ...report.issues.security.slice(0, 5),
    ...report.issues.bugs.slice(0, 5),
    ...report.issues.performance.slice(0, 5),
  ].map((i) => `- [${i.severity}] ${i.title} (${i.file}): ${i.recommendation.slice(0, 100)}`).join("\n");

  switch (passType) {
    case "summary":
      return `${repoInfo}

Top issues:
${topIssues}

Generate a 2-3 sentence executive summary focused on business impact and overall code health. Respond as JSON: {"summary": "string"}`;

    case "security":
      return `${repoInfo}

Security issues found:
${report.issues.security.map((i) => `- [${i.severity}] ${i.title} (${i.file}): ${i.description}`).join("\n")}

For each security issue, provide a root cause analysis, a code fix, and business impact. Respond as JSON:
{"reviews": [{"issue": "string", "rootCause": "string", "fixCode": "string (code block)", "impact": "string"}]}`;

    case "architecture":
      return `${repoInfo}

Architecture:
- Pattern: ${report.architecture.pattern}
- Strengths: ${report.architecture.strengths.join("; ")}
- Weaknesses: ${report.architecture.weaknesses.join("; ")}
- Layers: ${report.architecture.layers.map((l) => `${l.name} (${l.files} files)`).join(", ")}

Evaluate the architecture and suggest improvements. Respond as JSON:
{"strengths": ["string"], "weaknesses": ["string"], "suggestions": [{"title": "string", "description": "string", "effort": "small|medium|large"}]}`;

    case "quality":
      const complexFiles = report.files
        .filter((f) => f.complexity > 10)
        .slice(0, 5)
        .map((f) => `- ${f.path} (${f.language}, complexity: ${f.complexity}, ${f.lines} lines): ${f.description}`)
        .join("\n");

      return `${repoInfo}

Most complex files:
${complexFiles || "None with high complexity"}

Review code quality for these files and suggest refactoring. Respond as JSON:
{"reviews": [{"file": "string", "issues": ["string"], "refactorSuggestion": "string"}]}`;

    case "priorities":
      return `${repoInfo}

All issues:
${topIssues}

Technical debt: ${report.technicalDebt.score}/100
Debt items: ${report.technicalDebt.items.map((t) => `${t.title} (${t.impact})`).join("; ")}

Rank the top 3 issues by business impact and create a 3-phase roadmap. Respond as JSON:
{"priorities": [{"issue": "string", "businessImpact": "string", "recommendation": "string"}], "roadmap": [{"phase": "string", "tasks": ["string"]}]}`;

    case "performance":  // ← NEW Pass 5
      return `${repoInfo}

Performance issues found:
${report.issues.performance.map((i) => `- [${i.severity}] ${i.title} (${i.file}): ${i.description}`).join("\n")}

Positive findings: ${report.perfPositiveFindings?.join("; ") || "None"}

For each performance issue, provide root cause, a code fix, and expected improvement. Respond as JSON:
{"reviews": [{"issue": "string", "rootCause": "string", "fixCode": "string (code block)", "expectedImprovement": "string"}]}`;

    case "bestPractices":  // ← NEW Pass 6
      const frameworks = parsed.frameworks.map((f) => `${f.name} ${f.version}`).join(", ") || "None detected";
      return `${repoInfo}

Frameworks: ${frameworks}
Primary language: ${parsed.languages[0]?.name ?? "Unknown"}

Audit this codebase against framework-specific best practices. For each framework detected, check:
- Project structure conventions
- Configuration best practices
- Performance optimizations
- Security hardening
- Testing practices
- Error handling patterns

Respond as JSON:
{"framework": "string (primary framework)", "passed": ["string (practices that pass)"], "failed": [{"practice": "string", "recommendation": "string"}], "score": number (0-100)}`;

    default:
      return "";
  }
}
