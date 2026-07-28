// Helper: build prompt for a single AI pass
// Extracted from ai-deep-analysis.ts so it can be used by ai-pass endpoint
//
// Wave 6 Phase 1 (AI-first): all prompts now request ENTERPRISE-GRADE STRUCTURED OUTPUT:
//   - evidence: array of "file:line" references (where the AI found the issue)
//   - confidence: 0.0–1.0 (how confident the AI is)
//   - fixPlan: array of step-by-step fix instructions (for actionable findings)
//   - severity: "critical" | "high" | "medium" | "low" (AI-assigned, may differ from static rule)
//
// All new fields are OPTIONAL in the consumer types — existing data without them
// still renders fine. This file only changes what the LLM is ASKED to produce.

import type { AnalysisReport } from "@/lib/types";

export type PassType =
  | "overview"
  | "summary"
  | "security"
  | "architecture"
  | "quality"
  | "priorities"
  | "performance"
  | "bestPractices"
  | "duplicates";

/** Shared structured-output preamble — included in every actionable pass. */
const STRUCTURED_FINDING_INSTRUCTIONS = `For EACH finding, you MUST include:
- evidence: array of exact "file:line" references (e.g. ["src/auth.ts:42", "src/utils.ts:88"]) — cite where you found the issue
- confidence: 0.0-1.0 (how confident you are this is a real issue)
- fixPlan: array of step-by-step fix instructions
- severity: "critical" | "high" | "medium" | "low" (your assessment — may differ from the static rule)`;

export function buildPromptForPass(
  passType: PassType,
  parsed: any,
  report: AnalysisReport
): string {
  const repoInfo = `Repository: ${parsed.owner}/${parsed.name} (${parsed.totalFiles} files, ${parsed.totalLines?.toLocaleString()} lines)
Primary language: ${parsed.languages?.[0]?.name ?? "Unknown"}
Frameworks: ${parsed.frameworks?.map((f: any) => f.name).join(", ") || "None"}
Architecture: ${report.architecture.pattern}
Scores — Overall: ${report.scores.overall}, Security: ${report.scores.security}, Performance: ${report.scores.performance}, Architecture: ${report.scores.architecture}`;

  // Sort issues by severity (critical → high → medium → low) and limit to top 10
  // Sending ALL issues (e.g., 173 performance) causes AI to fail (token limit + JSON too large)
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const topBySeverity = (issues: any[], max: number) =>
    [...issues].sort((a, b) => (severityOrder[a.severity as keyof typeof severityOrder] ?? 9) - (severityOrder[b.severity as keyof typeof severityOrder] ?? 9)).slice(0, max);

  const topIssues = [
    ...topBySeverity(report.issues.security, 5),
    ...topBySeverity(report.issues.bugs, 5),
    ...topBySeverity(report.issues.performance, 5),
  ].map((i) => `- [${i.severity}] ${i.title} (${i.file}): ${i.recommendation?.slice(0, 100) ?? ""}`).join("\n");

  switch (passType) {
    case "overview":
      // NEW (Wave 6 Phase 1): executive-level decision intelligence pass.
      // Runs first (or in parallel with summary) to give leadership a 30-second read.
      return `${repoInfo}

All issues summary:
${topIssues}

Scores: Overall ${report.scores.overall}/100, Security ${report.scores.security}/100, Performance ${report.scores.performance}/100, Architecture ${report.scores.architecture}/100.

Provide executive-level decision intelligence. Respond as JSON:
{"topRisks": [{"title": "string", "description": "string", "severity": "critical|high|medium|low", "evidence": ["file:line"]}], "quickWins": [{"title": "string", "description": "string", "effort": "small|medium|large", "evidence": ["file:line"]}], "fixFirst": "string (what to fix first and why)", "fastestScoreGain": "string (what will improve score fastest)", "healthAssessment": "string (2-3 sentence overall health narrative)"}`;

    case "summary":
      // Executive summary — single prose block, but ask for evidence trail + confidence.
      return `${repoInfo}

Top issues:
${topIssues}

Generate a 2-3 sentence executive summary focused on business impact and overall code health. Include evidence (top file:line refs the summary is based on) and a confidence score. Respond as JSON:
{"summary": "string", "evidence": ["file:line"], "confidence": 0.0-1.0}`;

    case "security":
      return `${repoInfo}

Security issues found:
${topBySeverity(report.issues.security, 10).map((i) => `- [${i.severity}] ${i.title} (${i.file}): ${i.description}`).join("\n")}

For each security issue, provide structured analysis. ${STRUCTURED_FINDING_INSTRUCTIONS}

Respond as JSON:
{"reviews": [{"issue": "string", "rootCause": "string", "fixCode": "string (code block)", "impact": "string", "evidence": ["file:line"], "confidence": 0.85, "fixPlan": ["step1", "step2"], "severity": "high"}]}`;

    case "architecture":
      return `${repoInfo}

Architecture:
- Pattern: ${report.architecture.pattern}
- Strengths: ${report.architecture.strengths.join("; ")}
- Weaknesses: ${report.architecture.weaknesses.join("; ")}
- Layers: ${report.architecture.layers.map((l) => `${l.name} (${l.files} files)`).join(", ")}

Evaluate the architecture and suggest improvements. For EACH suggestion, include evidence (file:line refs), confidence (0.0-1.0), and severity. Respond as JSON:
{"strengths": ["string"], "weaknesses": ["string"], "suggestions": [{"title": "string", "description": "string", "effort": "small|medium|large", "evidence": ["file:line"], "confidence": 0.8, "severity": "high"}]}`;

    case "quality":
      return `${repoInfo}

Code quality issues:
${topBySeverity(report.issues.bugs, 10).map((i) => `- [${i.severity}] ${i.title} (${i.file}): ${i.description}`).join("\n")}

For each code quality issue, provide structured analysis. ${STRUCTURED_FINDING_INSTRUCTIONS}

Respond as JSON:
{"reviews": [{"issue": "string", "rootCause": "string", "fixCode": "string (code block)", "impact": "string", "evidence": ["file:line"], "confidence": 0.85, "fixPlan": ["step1", "step2"], "severity": "medium"}]}`;

    case "priorities":
      // Phase 2 (P2.3): Enhanced Roadmap Agent — effort + deps + phases + sequencer
      // New fields: effortHours, effortBand, roiScore, releasePhase, dependsOn, blocks
      // Plus roadmap phases (typed P0-P3), executiveNote for the CTO.
      return `${repoInfo}

All issues summary:
${topIssues}

Prioritize the top issues by business impact. For EACH priority, you MUST include:
- effortHours: estimated effort in hours (use Fibonacci-ish: 0.5, 1, 2, 4, 8, 16, 40). Calibration: trivial=0.5h, small=2h, medium=4h, large=8h, xl=16h+
- effortBand: "trivial" | "small" | "medium" | "large" | "xl" (matching the hours)
- roiScore: 0-100 (business impact / effort — higher = better ROI)
- releasePhase: "P0" (now/critical) | "P1" (this sprint) | "P2" (next sprint) | "P3" (backlog)
- dependsOn: array of issue titles that MUST be done first (empty if none)
- blocks: array of issue titles this unblocks (empty if none)

For the roadmap, each phase MUST have:
- phase: "P0" | "P1" | "P2" | "P3"
- title: short phase name (e.g. "Critical Security Fixes")
- tasks: array of task descriptions
- estimatedEffortHours: sum of member efforts
- blockedBy: array of phases that must complete first (empty for P0)

Also provide:
- executiveNote: 1-paragraph narrative for the CTO explaining the sequencing strategy.

Respond as JSON:
{"priorities": [{"issue": "string", "businessImpact": "string", "recommendation": "string", "evidence": ["file:line"], "confidence": 0.85, "severity": "high", "fixPlan": ["step1"], "effortHours": 4, "effortBand": "medium", "roiScore": 75, "releasePhase": "P1", "dependsOn": ["other issue title"], "blocks": []}], "roadmap": [{"phase": "P0", "title": "Critical Fixes", "tasks": ["..."], "estimatedEffortHours": 8, "blockedBy": []}], "executiveNote": "string"}`;

    case "performance":
      return `${repoInfo}

Performance issues:
${topBySeverity(report.issues.performance, 10).map((i) => `- [${i.severity}] ${i.title} (${i.file}): ${i.description}`).join("\n")}

Positive findings: ${report.perfPositiveFindings?.join("; ") || "None"}

For each performance issue, provide structured analysis. ${STRUCTURED_FINDING_INSTRUCTIONS}

Respond as JSON:
{"reviews": [{"issue": "string", "rootCause": "string", "fixCode": "string (code block)", "expectedImprovement": "string", "evidence": ["file:line"], "confidence": 0.85, "fixPlan": ["step1", "step2"], "severity": "medium"}]}`;

    case "bestPractices":
      return `${repoInfo}

Frameworks: ${parsed.frameworks?.map((f: any) => `${f.name} ${f.version}`).join(", ") || "None detected"}
Primary language: ${parsed.languages?.[0]?.name ?? "Unknown"}

Audit this codebase against framework-specific best practices. For EACH failed practice, include evidence (file:line refs), confidence (0.0-1.0), and severity. Respond as JSON:
{"framework": "string", "passed": ["string"], "failed": [{"practice": "string", "recommendation": "string", "evidence": ["file:line"], "confidence": 0.85, "severity": "medium"}], "score": number (0-100)}`;

    case "duplicates":
      // Pre-filter: only send functions that share names or have similar complexity
      const allFuncs = (parsed.files || []).flatMap((f: any) =>
        (f.functions || []).map((fn: string) => ({ file: f.path, fn }))
      );

      // Group by function name — only send groups with potential duplicates
      const funcNameMap = new Map<string, { file: string; fn: string }[]>();
      allFuncs.forEach(f => {
        const arr = funcNameMap.get(f.fn) || [];
        arr.push(f);
        funcNameMap.set(f.fn, arr);
      });

      // Also include functions from files with high complexity
      const highComplexityFiles = (parsed.files || [])
        .filter((f: any) => f.complexity > 15)
        .slice(0, 20)
        .map((f: any) => f.path);

      const potentialDupes = Array.from(funcNameMap.entries())
        .filter(([_, files]) => files.length > 1)
        .slice(0, 50)
        .map(([fn, files]) => `- ${fn}: ${files.map(f => f.file).join(", ")}`)
        .join("\n");

      return `${repoInfo}

Potential duplicate functions (same name in multiple files):
${potentialDupes || "None found by static analysis"}

High-complexity files (may contain duplicated logic):
${highComplexityFiles.map(f => `- ${f}`).join("\n") || "None"}

Analyze for REAL code duplication. Look for:
1. Duplicate business logic (same algorithm, different function names)
2. Structural duplication (similar code patterns)
3. Copy-paste code with minor variations
4. Redundant utility functions

For EACH duplicate cluster, include evidence (file:line refs) and confidence (0.0-1.0). Respond as JSON:
{"duplicates": [{"files": ["string"], "type": "logic|structural|copy-paste|redundant", "description": "string", "recommendation": "string", "estimatedLinesSaved": number, "evidence": ["file:line"], "confidence": 0.85}]}`;

    default:
      return "";
  }
}
