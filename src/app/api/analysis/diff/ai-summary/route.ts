// POST /api/analysis/diff/ai-summary — AI explains the diff between 2 analyses
//
// Timeline tab (Phase 2 — P2.5 AI Summary) — when the user picks a from→to
// comparison and clicks "🤖 AI Explain Changes", this endpoint:
//   1. Ownership-checks BOTH analyses (multi-tenant safe).
//   2. Re-computes the diff (analysis-diff.ts) + regression classification
//      (regression-detector.ts) — same pure functions the GET /diff endpoint
//      uses, so the AI sees identical numbers to what the UI shows.
//   3. Builds a structured prompt: score deltas, new/resolved issue counts,
//      file changes, tech-debt delta, top regressions/improvements, verdict.
//   4. Calls the AI via callAIWithFallback (respects the admin's fallback
//      chain + per-user token budget). BYOK users fall back to their own key
//      if no platform AI is configured.
//   5. Parses the AI's JSON response ({summary, trendAnalysis, concerns[],
//      wins[], recommendation}) — tolerant of ```json fences and leading text.
//   6. Returns { summary, providerUsed } — the frontend renders the card.
//
// Auth: requireUserId() + ownership check on both `from` and `to` analyses.
// Lazy: only invoked on explicit button click (never on diff load).
// maxDuration=55 — leaves headroom under Vercel's 60s Hobby limit for the
// AI round-trip (typ. 5–15s) plus the diff compute (<500ms).

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { diffAnalyses } from "@/lib/analysis-diff";
import { classifyRegressions } from "@/lib/regression-detector";
import { callAIWithFallback, getFallbackChain } from "@/lib/ai-fallback";
import { getPlatformAIConfig } from "@/lib/platform-ai";
import type { AIMessage } from "@/lib/ai-client";
import type { AnalysisReport } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

interface AISummary {
  summary?: string;
  trendAnalysis?: string;
  concerns?: string[];
  wins?: string[];
  recommendation?: string;
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { from, to, language } = (await req.json()) as {
    from?: string;
    to?: string;
    language?: string;
  };

  if (!from || !to) {
    return NextResponse.json(
      { error: "from and to required" },
      { status: 400 },
    );
  }
  if (from === to) {
    return NextResponse.json(
      { error: "from and to must be different analyses" },
      { status: 400 },
    );
  }

  // Ownership-check both analyses (multi-tenant — each must belong to userId).
  // Select only `report` + `createdAt` — never load `parsedData` (5MB blob).
  const [fromAnalysis, toAnalysis] = await Promise.all([
    db.analysis.findUnique({
      where: { id: from },
      select: { userId: true, report: true, createdAt: true },
    }),
    db.analysis.findUnique({
      where: { id: to },
      select: { userId: true, report: true, createdAt: true },
    }),
  ]);
  if (!fromAnalysis || fromAnalysis.userId !== userId) {
    return NextResponse.json({ error: "From not found" }, { status: 404 });
  }
  if (!toAnalysis || toAnalysis.userId !== userId) {
    return NextResponse.json({ error: "To not found" }, { status: 404 });
  }

  // Parse both reports (graceful on malformed JSON — matches /diff endpoint).
  let fromReport: AnalysisReport;
  let toReport: AnalysisReport;
  try {
    fromReport = JSON.parse(fromAnalysis.report) as AnalysisReport;
  } catch {
    return NextResponse.json(
      { error: "From analysis report is malformed" },
      { status: 500 },
    );
  }
  try {
    toReport = JSON.parse(toAnalysis.report) as AnalysisReport;
  } catch {
    return NextResponse.json(
      { error: "To analysis report is malformed" },
      { status: 500 },
    );
  }

  // Pure-function diff + classifier — deterministic, never throws.
  const fromIso =
    fromAnalysis.createdAt instanceof Date
      ? fromAnalysis.createdAt.toISOString()
      : String(fromAnalysis.createdAt);
  const toIso =
    toAnalysis.createdAt instanceof Date
      ? toAnalysis.createdAt.toISOString()
      : String(toAnalysis.createdAt);

  const diff = diffAnalyses(fromReport, toReport, {
    analysisId: from,
    createdAt: fromIso,
  }, {
    analysisId: to,
    createdAt: toIso,
  });
  const regression = classifyRegressions(diff, {
    analysisId: from,
    createdAt: fromIso,
  });

  const lang = language || "en";

  // ── Resolve AI provider ──
  // Priority: 1) Platform AI (admin-configured) 2) User's BYOK credential
  // (most-recently-updated enabled credential). If neither, 400.
  let aiConfig = await getPlatformAIConfig();
  if (!aiConfig) {
    const cred = await db.providerCredential.findFirst({
      where: { userId, enabled: true },
      orderBy: { updatedAt: "desc" },
    });
    if (cred) {
      const { decrypt } = await import("@/lib/crypto");
      const apiKey = decrypt(cred.encryptedApiKey);
      if (apiKey) {
        aiConfig = {
          providerId: cred.providerId,
          apiKey,
          baseUrl: cred.baseUrl,
          model: cred.model,
          temperature: 0.4,
          maxTokens: 3000,
          timeout: 50,
        };
      }
    }
  }
  if (!aiConfig) {
    return NextResponse.json(
      { error: "No AI provider configured" },
      { status: 400 },
    );
  }

  const fallbacks = await getFallbackChain();

  // ── Language instruction ──
  // KEEP UNTRANSLATED: file paths, technical terms (e.g. "SQL injection",
  // "eslint", "webpack"). The AI is told explicitly to preserve these as-is.
  const langInstruction =
    lang === "vi"
      ? "\n\nQUAN TRỌNG: Trả lời bằng tiếng Việt. Giữ nguyên file paths, thuật ngữ kỹ thuật (ví dụ: 'SQL injection', 'eslint', 'webpack')."
      : "\n\nIMPORTANT: Respond in English. Keep file paths and technical terms as-is (e.g. 'SQL injection', 'eslint', 'webpack').";

  // ── Build prompt ──
  // Compact stat block: enough context for the AI to write a meaningful
  // narrative, but no raw issue lists (those would blow the token budget on
  // large repos). Top-5 regressions + improvements give the AI concrete
  // examples to cite.
  const fmtDelta = (n: number) => `${n > 0 ? "+" : ""}${n}`;
  const fromScore = fromReport.scores?.overall ?? 0;
  const toScore = toReport.scores?.overall ?? 0;

  const topRegressions = regression.regressions
    .slice(0, 5)
    .map((r) => `- [${r.severity}] ${r.title}: ${r.detail}`)
    .join("\n");
  const topImprovements = regression.improvements
    .slice(0, 5)
    .map((i) => `- ${i.title}: ${i.detail}`)
    .join("\n");

  const prompt = `Analyze the changes between two scans of the same repository and provide insights.

Diff Summary:
- From: ${new Date(fromIso).toLocaleDateString()} (score: ${fromScore})
- To: ${new Date(toIso).toLocaleDateString()} (score: ${toScore})
- Score deltas: Overall ${fmtDelta(diff.scores.overall)}, Security ${fmtDelta(diff.scores.security)}, Performance ${fmtDelta(diff.scores.performance)}
- New issues: ${diff.issues.added.length}
- Resolved issues: ${diff.issues.resolved.length}
- Files added: ${diff.files.added.length}, deleted: ${diff.files.deleted.length}
- Tech debt change: ${fmtDelta(diff.techDebt.scoreDelta)}

Regression verdict: ${regression.verdict}
Regressions: ${regression.regressions.length}
Improvements: ${regression.improvements.length}

Top regressions:
${topRegressions || "(none)"}

Top improvements:
${topImprovements || "(none)"}

Provide a narrative analysis as JSON with this exact shape:
{"summary": "2-3 sentence executive summary of what changed", "trendAnalysis": "are things getting better or worse? what's the trajectory?", "concerns": ["specific things to worry about"], "wins": ["specific improvements worth celebrating"], "recommendation": "what should the team focus on next?"}`;

  const messages: AIMessage[] = [
    {
      role: "system",
      content:
        "You are a senior engineering manager reviewing code quality trends between two scans of the same repository. Respond in valid JSON only — no preamble, no markdown fences." +
        langInstruction,
    },
    { role: "user", content: prompt },
  ];

  try {
    const result = await callAIWithFallback(aiConfig, fallbacks, messages, {
      temperature: 0.4,
      maxTokens: 3000,
      timeout: 45,
      userId,
      plan: "enterprise",
      audit: { userId, agent: "timeline-ai-summary" },
    });

    // ── Parse JSON — tolerant of ```json fences + leading/trailing text ──
    let summary: AISummary | null = null;
    if (result.content) {
      let cleaned = result.content
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "");
      try {
        summary = JSON.parse(cleaned) as AISummary;
      } catch {
        // Fall back: extract the first {...} block (some models prepend a
        // sentence like "Here's the analysis:" before the JSON).
        const firstBrace = cleaned.indexOf("{");
        const lastBrace = cleaned.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          try {
            summary = JSON.parse(
              cleaned.slice(firstBrace, lastBrace + 1),
            ) as AISummary;
          } catch {
            summary = null;
          }
        }
      }
    }

    // Normalize array fields — be defensive about the AI returning a string
    // instead of an array, or omitting a field entirely.
    if (summary) {
      const toArray = (v: unknown): string[] => {
        if (Array.isArray(v)) {
          return v.map((x) => String(x)).filter(Boolean);
        }
        if (typeof v === "string" && v.trim()) return [v.trim()];
        return [];
      };
      summary.concerns = toArray(summary.concerns);
      summary.wins = toArray(summary.wins);
    }

    return NextResponse.json({
      summary,
      providerUsed: result.providerUsed,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg || "AI summary failed" },
      { status: 500 },
    );
  }
}
