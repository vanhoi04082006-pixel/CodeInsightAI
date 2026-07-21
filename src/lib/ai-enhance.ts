// CodeInsight AI — Optional AI-enhanced analysis summary
//
// After static analysis (66 rules) is done, this module calls the LLM to:
// - Generate a natural language executive summary (replaces the template)
// - Prioritize issues by business impact
// - Suggest 3 refactoring patterns
//
// If no AI provider is available (BYOK not configured + no Platform AI key),
// this module returns null and the report keeps the static summary.
//
// The AI enhancement is OPTIONAL — the user can toggle it in settings.
// Default: OFF (to save tokens). When ON, it adds ~2-5 seconds to analysis.

import type { AnalysisReport, Issue } from "@/lib/types";
import type { ParsedRepository } from "@/lib/repo-parser";

export interface AIEnhancementResult {
  aiSummary: string;
  aiPriorities: Array<{ issue: string; businessImpact: string; recommendation: string }>;
  aiRefactorSuggestions: string[];
  aiBadge: "ai-enhanced" | "static-only";
}

/**
 * Build the LLM prompt for AI enhancement.
 * We send a compact representation of the report (not the raw code) to save tokens.
 */
function buildPrompt(parsed: ParsedRepository, report: AnalysisReport): string {
  const topIssues = [
    ...report.issues.security.slice(0, 5),
    ...report.issues.bugs.slice(0, 5),
    ...report.issues.performance.slice(0, 5),
  ].map((i, idx) => `${idx + 1}. [${i.severity}] ${i.title} (${i.file}) — ${i.recommendation.slice(0, 100)}`);

  return `You are a Senior Staff Engineer reviewing a repository. Based on the static analysis below, generate:

1. **Executive Summary** (2-3 sentences) — natural language, business-focused
2. **Top 3 Priority Issues** — rank by business impact (not just severity)
3. **Refactoring Suggestions** (3 items) — concrete, actionable

Repository: ${parsed.owner}/${parsed.name} (${parsed.totalFiles} files, ${parsed.totalLines.toLocaleString()} lines)
Primary language: ${parsed.languages[0]?.name ?? "Unknown"}
Frameworks: ${parsed.frameworks.map((f) => f.name).join(", ") || "None detected"}
Architecture: ${report.architecture.pattern}

Scores (0-100):
- Overall: ${report.scores.overall}
- Security: ${report.scores.security}
- Performance: ${report.scores.performance}
- Architecture: ${report.architecture.architecture}
- Maintainability: ${report.scores.maintainability}

Top issues found by static analysis:
${topIssues.join("\n") || "None"}

Architecture strengths: ${report.architecture.strengths.slice(0, 3).join("; ")}
Architecture weaknesses: ${report.architecture.weaknesses.slice(0, 3).join("; ")}

Technical debt score: ${report.technicalDebt.score}/100

Respond in JSON format:
{
  "summary": "string (2-3 sentences, business-focused)",
  "priorities": [
    { "issue": "string", "businessImpact": "string", "recommendation": "string" }
  ],
  "refactorSuggestions": ["string", "string", "string"]
}`;
}

/**
 * Call the LLM to enhance the report with AI-generated insights.
 * Returns null if no provider is available or the call fails.
 */
export async function enhanceWithAI(
  parsed: ParsedRepository,
  report: AnalysisReport,
  opts: {
    providerId?: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  }
): Promise<AIEnhancementResult | null> {
  // If no API key, return null (static-only)
  if (!opts.apiKey) {
    return {
      aiSummary: "",
      aiPriorities: [],
      aiRefactorSuggestions: [],
      aiBadge: "static-only",
    };
  }

  const prompt = buildPrompt(parsed, report);
  const model = opts.model || "gpt-4o-mini";
  const baseUrl = opts.baseUrl || "https://openrouter.ai/api/v1";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    // Build request — OpenAI-compatible (works for OpenRouter, OpenAI, DeepSeek, Groq, etc.)
    let url: string;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    let body: Record<string, unknown>;

    if (opts.providerId === "anthropic") {
      url = baseUrl.endsWith("/v1") ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`;
      headers["x-api-key"] = opts.apiKey;
      headers["anthropic-version"] = "2023-06-01";
      body = {
        model,
        max_tokens: 1024,
        system: "You are a Senior Staff Engineer. Respond in valid JSON only, no markdown.",
        messages: [{ role: "user", content: prompt }],
      };
    } else {
      url = baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
      headers["Authorization"] = `Bearer ${opts.apiKey}`;
      if (opts.providerId === "openrouter") {
        headers["HTTP-Referer"] = "https://codeinsight.ai";
        headers["X-Title"] = "CodeInsight AI";
      }
      body = {
        model,
        messages: [
          { role: "system", content: "You are a Senior Staff Engineer. Respond in valid JSON only, no markdown." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1024,
        response_format: { type: "json_object" },
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error("[ai-enhance] LLM error:", res.status, await res.text().catch(() => ""));
      return null;
    }

    const data = await res.json();
    let content: string;
    if (opts.providerId === "anthropic") {
      content = data.content?.[0]?.text || "";
    } else {
      content = data.choices?.[0]?.message?.content || "";
    }

    if (!content) return null;

    // Parse the JSON response
    let parsed_response: any;
    try {
      // Strip markdown code fences if present
      const cleaned = content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
      parsed_response = JSON.parse(cleaned);
    } catch {
      console.error("[ai-enhance] Failed to parse LLM response as JSON");
      return null;
    }

    return {
      aiSummary: parsed_response.summary || "",
      aiPriorities: Array.isArray(parsed_response.priorities) ? parsed_response.priorities.slice(0, 3) : [],
      aiRefactorSuggestions: Array.isArray(parsed_response.refactorSuggestions) ? parsed_response.refactorSuggestions.slice(0, 3) : [],
      aiBadge: "ai-enhanced",
    };
  } catch (e) {
    console.error("[ai-enhance] Error:", e);
    return null;
  }
}
