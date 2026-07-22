// CodeInsight AI — Deep AI Analysis (5-pass)
//
// When an AI provider is available (BYOK or Platform AI), runs 5 LLM passes
// to generate a comprehensive analysis:
// 1. Executive Summary (business-focused)
// 2. Deep Security Review (with AI-generated fix code)
// 3. Architecture Analysis (pattern evaluation + improvements)
// 4. Code Quality Review (complex files + refactored code)
// 5. Priorities + Roadmap (ranked by business impact)
//
// Total token cost: ~7000 tokens per analysis (vs ~500 for basic enhancement).
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
  priorities: Array<{ issue: string; businessImpact: string; recommendation: string }>;
  roadmap: Array<{ phase: string; tasks: string[] }>;
}

/**
 * Run 5-pass deep analysis on a repository report.
 * Returns null if the AI call fails (non-fatal — keeps static report).
 */
export async function runDeepAnalysis(
  parsed: ParsedRepository,
  report: AnalysisReport,
  provider: AIProviderConfig
): Promise<DeepAnalysisResult | null> {
  try {
    // Run passes in parallel where possible (1+5 parallel, then 2+3+4 parallel)
    const [summaryResult, prioritiesResult] = await Promise.all([
      runPass(provider, "summary", parsed, report),
      runPass(provider, "priorities", parsed, report),
    ]);

    const [securityResult, archResult, qualityResult] = await Promise.all([
      runPass(provider, "security", parsed, report),
      runPass(provider, "architecture", parsed, report),
      runPass(provider, "quality", parsed, report),
    ]);

    const result: DeepAnalysisResult = {
      badge: "deep-ai",
      executiveSummary: summaryResult?.summary || report.summary,
      securityReview: securityResult?.reviews || [],
      architectureReview: archResult || { strengths: [], weaknesses: [], suggestions: [] },
      codeQualityReview: qualityResult?.reviews || [],
      priorities: prioritiesResult?.priorities || [],
      roadmap: prioritiesResult?.roadmap || [],
    };

    return result;
  } catch (e) {
    console.error("[deep-analysis] Error:", e);
    return null;
  }
}

async function runPass(
  provider: AIProviderConfig,
  passType: "summary" | "security" | "architecture" | "quality" | "priorities",
  parsed: ParsedRepository,
  report: AnalysisReport
): Promise<any> {
  const prompt = buildPrompt(passType, parsed, report);
  const messages: AIMessage[] = [
    { role: "system", content: "You are a Senior Staff Engineer. Respond in valid JSON only, no markdown fences." },
    { role: "user", content: prompt },
  ];

  try {
    const result = await callAI(provider, messages, {
      temperature: 0.3,
      maxTokens: 2000,
      timeout: 45,
      responseFormat: "json_object",
    });

    if (!result.content) return null;
    const cleaned = result.content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error(`[deep-analysis] Pass ${passType} failed:`, e);
    return null;
  }
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

    default:
      return "";
  }
}
