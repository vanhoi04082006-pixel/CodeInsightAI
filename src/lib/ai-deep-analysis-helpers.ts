// Helper: build prompt for a single AI pass
// Extracted from ai-deep-analysis.ts so it can be used by ai-pass endpoint

import type { AnalysisReport } from "@/lib/types";

type PassType = "summary" | "security" | "architecture" | "quality" | "priorities" | "performance" | "bestPractices" | "duplicates";

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

  const topIssues = [
    ...report.issues.security.slice(0, 5),
    ...report.issues.bugs.slice(0, 5),
    ...report.issues.performance.slice(0, 5),
  ].map((i) => `- [${i.severity}] ${i.title} (${i.file}): ${i.recommendation?.slice(0, 100) ?? ""}`).join("\n");

  switch (passType) {
    case "summary":
      return `${repoInfo}\n\nTop issues:\n${topIssues}\n\nGenerate a 2-3 sentence executive summary focused on business impact and overall code health. Respond as JSON: {"summary": "string"}`;

    case "security":
      return `${repoInfo}\n\nSecurity issues found:\n${report.issues.security.map((i) => `- [${i.severity}] ${i.title} (${i.file}): ${i.description}`).join("\n")}\n\nFor each security issue, provide a root cause analysis, a code fix, and business impact. Respond as JSON:\n{"reviews": [{"issue": "string", "rootCause": "string", "fixCode": "string (code block)", "impact": "string"}]}`;

    case "architecture":
      return `${repoInfo}\n\nArchitecture:\n- Pattern: ${report.architecture.pattern}\n- Strengths: ${report.architecture.strengths.join("; ")}\n- Weaknesses: ${report.architecture.weaknesses.join("; ")}\n- Layers: ${report.architecture.layers.map((l) => `${l.name} (${l.files} files)`).join(", ")}\n\nEvaluate the architecture and suggest improvements. Respond as JSON:\n{"strengths": ["string"], "weaknesses": ["string"], "suggestions": [{"title": "string", "description": "string", "effort": "small|medium|large"}]}`;

    case "quality":
      return `${repoInfo}\n\nCode quality issues:\n${report.issues.bugs.map((i) => `- [${i.severity}] ${i.title} (${i.file}): ${i.description}`).join("\n")}\n\nFor each code quality issue, provide root cause and fix. Respond as JSON:\n{"reviews": [{"issue": "string", "rootCause": "string", "fixCode": "string (code block)", "impact": "string"}]}`;

    case "priorities":
      return `${repoInfo}\n\nAll issues summary:\n${topIssues}\n\nPrioritize the top issues by business impact. For each, provide a recommendation and roadmap phase. Respond as JSON:\n{"priorities": [{"issue": "string", "businessImpact": "string", "recommendation": "string"}], "roadmap": [{"phase": "string", "tasks": ["string"]}]}`;

    case "performance":
      return `${repoInfo}\n\nPerformance issues:\n${report.issues.performance.map((i) => `- [${i.severity}] ${i.title} (${i.file}): ${i.description}`).join("\n")}\n\nPositive findings: ${report.perfPositiveFindings?.join("; ") || "None"}\n\nFor each performance issue, provide root cause, a code fix, and expected improvement. Respond as JSON:\n{"reviews": [{"issue": "string", "rootCause": "string", "fixCode": "string (code block)", "expectedImprovement": "string"}]}`;

    case "bestPractices":
      const frameworks = parsed.frameworks?.map((f: any) => `${f.name} ${f.version}`).join(", ") || "None detected";
      return `${repoInfo}\n\nFrameworks: ${frameworks}\nPrimary language: ${parsed.languages?.[0]?.name ?? "Unknown"}\n\nAudit this codebase against framework-specific best practices. Respond as JSON:\n{"framework": "string", "passed": ["string"], "failed": [{"practice": "string", "recommendation": "string"}], "score": number (0-100)}`;

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

      return `${repoInfo}\n\nPotential duplicate functions (same name in multiple files):\n${potentialDupes || "None found by static analysis"}\n\nHigh-complexity files (may contain duplicated logic):\n${highComplexityFiles.map(f => `- ${f}`).join("\n") || "None"}\n\nAnalyze for REAL code duplication. Look for:\n1. Duplicate business logic (same algorithm, different function names)\n2. Structural duplication (similar code patterns)\n3. Copy-paste code with minor variations\n4. Redundant utility functions\n\nRespond as JSON:\n{"duplicates": [{"files": ["string"], "type": "logic|structural|copy-paste|redundant", "description": "string", "recommendation": "string", "estimatedLinesSaved": number}]}`;

    default:
      return "";
  }
}
