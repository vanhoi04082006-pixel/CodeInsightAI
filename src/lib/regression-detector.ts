// CodeInsight AI — Regression Classifier (Phase 2 — P2.4)
//
// Pure-function classifier that turns a raw AnalysisDiffResult (P2.2) into a
// human-friendly RegressionReport — what got worse, what got better, and an
// overall verdict (improved / regressed / neutral).
//
// Pure = no I/O, no DB, no Date.now, no Math.random. The API layer
// /api/analysis/regressions/route.ts owns auth + persistence; this module
// only transforms data.
//
// Classification rules (see P2.4 spec, worklog lines 387–393):
//   - new-issue         → severity carried from Issue.severity ("info" coerced to "low")
//   - score-drop        → ≤ -10 critical, ≤ -5 high
//   - complexity-spike  → ≥ +10 medium
//   - tech-debt-up      → scoreDelta ≤ -5 medium
//   - new-dead-code     → (future) low
//   Inverse rules for improvements (resolved-issue, score-gain, tech-debt-down,
//   complexity-reduction).
//
// Verdict logic:
//   - "regressed"  → any critical regression, OR ≥2 high regressions AND overall score dropped
//   - "improved"   → overall score +≥5 AND more improvements than regressions
//   - "neutral"    → otherwise
//
// Backward-compatible: missing optional fields on the diff are treated as
// 0 / empty arrays. The classifier NEVER throws — top-level try/catch
// returns an empty RegressionReport on any internal error.

import type { AnalysisDiffResult } from "./analysis-diff";
import type { Issue } from "./types";

/* ---------- public interfaces ---------- */

export type RegressionKind =
  | "new-issue"
  | "score-drop"
  | "new-dead-code"
  | "tech-debt-up"
  | "complexity-spike";

export type ImprovementKind =
  | "resolved-issue"
  | "score-gain"
  | "tech-debt-down"
  | "complexity-reduction";

export type RegressionSeverity = "critical" | "high" | "medium" | "low";

export type RegressionVerdict = "improved" | "regressed" | "neutral";

export interface RegressionItem {
  kind: RegressionKind;
  severity: RegressionSeverity;
  title: string;
  detail: string;
  evidence?: string[];
}

export interface ImprovementItem {
  kind: ImprovementKind;
  title: string;
  detail: string;
  evidence?: string[];
}

export interface RegressionReport {
  /** The previous scan this report is compared against. */
  comparedTo: { analysisId: string; createdAt: string };
  /** Signed score deltas (to - from). Re-exported from the diff for UI convenience. */
  scoreDeltas: AnalysisDiffResult["scores"];
  regressions: RegressionItem[];
  improvements: ImprovementItem[];
  verdict: RegressionVerdict;
  /** 1-sentence headline: "Score +5 — 3 improvements — 2 regressions". */
  headline: string;
}

/* ---------- helpers ---------- */

/**
 * Coerce an Issue.severity (which includes "info") to a RegressionSeverity
 * (which does not). "info" → "low"; unknown values → "low".
 */
function toRegressionSeverity(sev: string | undefined): RegressionSeverity {
  if (sev === "critical" || sev === "high" || sev === "medium" || sev === "low") {
    return sev;
  }
  return "low";
}

/** Format a `file:line` evidence string for an Issue. */
function issueLocation(issue: Issue): string {
  const file = issue.file || "<unknown>";
  return issue.line ? `${file}:${issue.line}` : file;
}

/** Sign-prefixed number: +5, -3, 0. */
function signed(n: number): string {
  if (n > 0) return `+${n}`;
  return `${n}`;
}

/* ---------- main entry ---------- */

/**
 * Classify a raw diff into a RegressionReport.
 *
 * @param diff            The AnalysisDiffResult from `diffAnalyses()`.
 * @param previousAnalysis  The previous scan's id + createdAt — used as the
 *                          `comparedTo` reference on the report.
 */
export function classifyRegressions(
  diff: AnalysisDiffResult,
  previousAnalysis: { analysisId: string; createdAt: string },
): RegressionReport {
  try {
    if (!diff || typeof diff !== "object") {
      return emptyReport(previousAnalysis);
    }

    const regressions: RegressionItem[] = [];
    const improvements: ImprovementItem[] = [];

    const addedIssues: Issue[] = Array.isArray(diff.issues?.added) ? diff.issues.added : [];
    const resolvedIssues: Issue[] = Array.isArray(diff.issues?.resolved) ? diff.issues.resolved : [];
    const modifiedFiles = Array.isArray(diff.files?.modified) ? diff.files.modified : [];
    const scores = diff.scores || ({} as AnalysisDiffResult["scores"]);
    const techDebt = diff.techDebt || { scoreDelta: 0, itemsAdded: 0, itemsResolved: 0 };

    // 1. New issues → regressions (severity carried from the issue)
    for (const issue of addedIssues) {
      if (!issue) continue;
      const sev = toRegressionSeverity(issue.severity);
      regressions.push({
        kind: "new-issue",
        severity: sev,
        title: issue.title || "Untitled issue",
        detail: `New ${sev} issue detected in ${issueLocation(issue)}`,
        evidence: [issueLocation(issue)],
      });
    }

    // 2. Resolved issues → improvements
    for (const issue of resolvedIssues) {
      if (!issue) continue;
      const sev = toRegressionSeverity(issue.severity);
      improvements.push({
        kind: "resolved-issue",
        title: issue.title || "Untitled issue",
        detail: `${sev} issue in ${issueLocation(issue)} resolved`,
        evidence: [issueLocation(issue)],
      });
    }

    // 3. Score drops → regressions; score gains → improvements
    for (const [key, deltaRaw] of Object.entries(scores)) {
      const delta = typeof deltaRaw === "number" ? deltaRaw : 0;
      if (delta <= -10) {
        regressions.push({
          kind: "score-drop",
          severity: "critical",
          title: `${key} score dropped ${delta} points`,
          detail: `${key} score Δ${signed(delta)} (critical drop ≥ 10)`,
        });
      } else if (delta <= -5) {
        regressions.push({
          kind: "score-drop",
          severity: "high",
          title: `${key} score dropped ${delta} points`,
          detail: `${key} score Δ${signed(delta)}`,
        });
      } else if (delta >= 5) {
        improvements.push({
          kind: "score-gain",
          title: `${key} score improved ${signed(delta)} points`,
          detail: `${key} score Δ${signed(delta)}`,
        });
      }
    }

    // 4. Tech debt up → regression; tech debt down → improvement
    //    (Convention: techDebt.score is "higher = better" — same direction as
    //    the regular sub-scores. A drop in techDebt.score = more debt.)
    if (techDebt.scoreDelta <= -5) {
      regressions.push({
        kind: "tech-debt-up",
        severity: "medium",
        title: `Tech debt increased by ${Math.abs(techDebt.scoreDelta)} points`,
        detail: `${techDebt.itemsAdded} new debt items, ${techDebt.itemsResolved} resolved`,
      });
    } else if (techDebt.scoreDelta >= 5) {
      improvements.push({
        kind: "tech-debt-down",
        title: `Tech debt reduced by ${techDebt.scoreDelta} points`,
        detail: `${techDebt.itemsResolved} debt items resolved, ${techDebt.itemsAdded} new`,
      });
    }

    // 5. Complexity spikes → regressions; complexity reductions → improvements
    for (const file of modifiedFiles) {
      if (!file || typeof file.complexityDelta !== "number") continue;
      if (file.complexityDelta >= 10) {
        regressions.push({
          kind: "complexity-spike",
          severity: "medium",
          title: `Complexity spike in ${file.path}`,
          detail: `Cyclomatic complexity increased by ${file.complexityDelta}`,
          evidence: [file.path],
        });
      } else if (file.complexityDelta <= -5) {
        improvements.push({
          kind: "complexity-reduction",
          title: `Complexity reduced in ${file.path}`,
          detail: `Cyclomatic complexity decreased by ${Math.abs(file.complexityDelta)}`,
          evidence: [file.path],
        });
      }
    }

    // 6. Compute verdict
    const criticalRegressions = regressions.filter((r) => r.severity === "critical").length;
    const highRegressions = regressions.filter((r) => r.severity === "high").length;
    const overallDelta = typeof scores.overall === "number" ? scores.overall : 0;

    let verdict: RegressionVerdict;
    if (criticalRegressions > 0 || (highRegressions >= 2 && overallDelta < 0)) {
      verdict = "regressed";
    } else if (overallDelta >= 5 && improvements.length > regressions.length) {
      verdict = "improved";
    } else {
      verdict = "neutral";
    }

    // 7. Headline — "Score +5 — 3 improvements — 2 regressions"
    const parts: string[] = [];
    if (overallDelta !== 0) parts.push(`Score ${signed(overallDelta)}`);
    if (improvements.length > 0) parts.push(`${improvements.length} improvement${improvements.length === 1 ? "" : "s"}`);
    if (regressions.length > 0) parts.push(`${regressions.length} regression${regressions.length === 1 ? "" : "s"}`);
    const headline = parts.join(" — ") || "No significant changes";

    return {
      comparedTo: {
        analysisId: previousAnalysis?.analysisId || "",
        createdAt: previousAnalysis?.createdAt || "",
      },
      scoreDeltas: scores,
      regressions,
      improvements,
      verdict,
      headline,
    };
  } catch {
    // Defensive — never throw. Return an empty report so the UI can render
    // a "no changes detected" state instead of crashing.
    return emptyReport(previousAnalysis);
  }
}

/** Safe empty report used when the classifier encounters an error. */
function emptyReport(previousAnalysis: { analysisId: string; createdAt: string }): RegressionReport {
  return {
    comparedTo: {
      analysisId: previousAnalysis?.analysisId || "",
      createdAt: previousAnalysis?.createdAt || "",
    },
    scoreDeltas: {
      overall: 0,
      security: 0,
      performance: 0,
      architecture: 0,
      maintainability: 0,
      codeQuality: 0,
    },
    regressions: [],
    improvements: [],
    verdict: "neutral",
    headline: "No significant changes",
  };
}
