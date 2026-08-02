// CodeInsight AI — Semantic Project Model Builder (Layer 0)
//
// Builds a SemanticProjectModel from an existing AnalysisReport.
// SPM is PURE DATA — no methods, no logic, no queries.
// Query logic lives in SemanticQueryService (Layer 2).
//
// Mapping strategy:
//   AnalysisReport → SPM is a 1-way transformation.
//   All data is mapped faithfully — no data is lost.
//   The SPM is additive: existing code continues to use AnalysisReport directly.

import type {
  SemanticProjectModel,
  SemanticFile,
  SemanticSymbol,
  SemanticEdge,
  SemanticIssue,
  SemanticInsight,
  SemanticArchitecture,
  SemanticMetrics,
  Result,
  AgentError,
} from "../contracts";
import type { AnalysisReport, FileInsight, Issue } from "@/lib/types";

// ═══════════════════════════════════════════════════════════════
// SCHEMA VERSION — bump when SPM schema changes (for cache invalidation)
// ═══════════════════════════════════════════════════════════════

export const SPM_SCHEMA_VERSION = 1;

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

/**
 * Build a SemanticProjectModel from an AnalysisReport.
 *
 * @param report - The existing AnalysisReport (from analyzeParsedRepository + AI passes)
 * @param analysisId - Optional analysis ID (from DB). If omitted, derived from repo info.
 * @returns Result<SemanticProjectModel> — never throws.
 */
export function buildSPM(
  report: AnalysisReport,
  analysisId?: string | null,
): Result<SemanticProjectModel> {
  try {
    if (!report) {
      return err("SPM_NOT_INITIALIZED", "AnalysisReport is null or undefined");
    }
    if (!report.repoOwner || !report.repoName) {
      return err("SPM_NOT_INITIALIZED", "Report missing repoOwner or repoName");
    }

    const id = analysisId ?? `${report.repoOwner}/${report.repoName}/${report.repoBranch}`;
    const createdAt = new Date().toISOString();

    const files = mapFiles(report);
    const symbols = mapSymbols(report, files);
    const edges = mapEdges(report, symbols);
    const issues = mapIssues(report);
    const insights = mapInsights(report);
    const architecture = mapArchitecture(report);
    const metrics = mapMetrics(report, files, symbols, edges);

    const spm: SemanticProjectModel = {
      id,
      repoOwner: report.repoOwner,
      repoName: report.repoName,
      branch: report.repoBranch || "main",
      commitSha: "", // Not available in AnalysisReport — would need git context
      createdAt,
      files,
      symbols,
      edges,
      issues,
      insights,
      architecture,
      metrics,
      schemaVersion: SPM_SCHEMA_VERSION,
    };

    return { ok: true, value: spm };
  } catch (e) {
    return err(
      "SPM_NOT_INITIALIZED",
      `Failed to build SPM: ${e instanceof Error ? e.message : String(e)}`,
      { error: e },
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL: Map Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Map AnalysisReport.files (FileInsight[]) → SemanticFile[]
 * Also enriches with rawContent from report.snippets where available.
 */
function mapFiles(report: AnalysisReport): SemanticFile[] {
  // Build a lookup of rawContent from snippets (for files that have snippets)
  const contentMap = new Map<string, string>();
  for (const snip of report.snippets ?? []) {
    if (snip.file && snip.rawContent) {
      contentMap.set(snip.file, snip.rawContent);
    }
  }

  return (report.files ?? []).map((f: FileInsight): SemanticFile => {
    const symbolIds: string[] = [];

    // Map function signatures to symbol IDs
    if (f.functionSignatures) {
      for (const fs of f.functionSignatures) {
        symbolIds.push(`${f.path}::${fs.name}::function`);
      }
    }
    // Map classes to symbol IDs
    if (f.classes) {
      for (const cls of f.classes) {
        symbolIds.push(`${f.path}::${cls}::class`);
      }
    }

    return {
      path: f.path,
      language: f.language || "unknown",
      lines: f.lines || 0,
      content: contentMap.get(f.path) || f.snippet || "",
      symbols: symbolIds,
      imports: f.imports || [],
    };
  });
}

/**
 * Map AnalysisReport.files → SemanticSymbol[]
 * Extracts functions, classes, imports, and exports from FileInsight.
 */
function mapSymbols(report: AnalysisReport, _files: SemanticFile[]): SemanticSymbol[] {
  const symbols: SemanticSymbol[] = [];

  for (const f of report.files ?? []) {
    // Functions from functionSignatures
    if (f.functionSignatures) {
      for (const fs of f.functionSignatures) {
        symbols.push({
          id: `${f.path}::${fs.name}::function`,
          name: fs.name,
          kind: "function",
          file: f.path,
          line: fs.startLine || 1,
          endLine: fs.endLine,
          exported: fs.isExported || false,
          parameters: fs.params?.map((p, i) => ({
            name: p || `arg${i}`,
            type: "any",
          })),
          returnType: fs.returnType,
        });
      }
    }

    // Classes
    if (f.classes) {
      for (const cls of f.classes) {
        symbols.push({
          id: `${f.path}::${cls}::class`,
          name: cls,
          kind: "class",
          file: f.path,
          line: 1, // FileInsight doesn't track class line numbers
          exported: (f.exports || []).includes(cls),
        });
      }
    }

    // Imports as symbols (so they can be referenced by edges)
    if (f.imports) {
      for (const imp of f.imports) {
        const importName = imp.split("/").pop() || imp;
        symbols.push({
          id: `${f.path}::${importName}::import`,
          name: importName,
          kind: "import",
          file: f.path,
          line: 1,
          exported: false,
        });
      }
    }

    // Exports (variables, types)
    if (f.exports) {
      for (const exp of f.exports) {
        // Skip if already mapped as function or class
        const exists = symbols.some(
          (s) => s.file === f.path && s.name === exp && (s.kind === "function" || s.kind === "class"),
        );
        if (!exists) {
          symbols.push({
            id: `${f.path}::${exp}::variable`,
            name: exp,
            kind: "variable",
            file: f.path,
            line: 1,
            exported: true,
          });
        }
      }
    }
  }

  return symbols;
}

/**
 * Map AnalysisReport.dependencies.edges + file imports → SemanticEdge[]
 */
function mapEdges(report: AnalysisReport, symbols: SemanticSymbol[]): SemanticEdge[] {
  const edges: SemanticEdge[] = [];

  // 1. Dependency edges (from dependency graph)
  const depNodes = new Map<string, string>();
  for (const node of report.dependencies?.nodes ?? []) {
    depNodes.set(node.id, node.label);
  }

  for (const depEdge of report.dependencies?.edges ?? []) {
    const sourceLabel = depNodes.get(depEdge.from) || depEdge.from;
    const targetLabel = depNodes.get(depEdge.to) || depEdge.to;
    edges.push({
      id: `dep:${depEdge.from}->${depEdge.to}`,
      type: "depends_on",
      source: sourceLabel,
      target: targetLabel,
    });
  }

  // 2. Import edges (from file-level imports)
  for (const f of report.files ?? []) {
    if (!f.imports) continue;
    for (const imp of f.imports) {
      // Find the import symbol in this file
      const importName = imp.split("/").pop() || imp;
      const sourceSymbol = symbols.find(
        (s) => s.file === f.path && s.name === importName && s.kind === "import",
      );
      edges.push({
        id: `imp:${f.path}->${imp}`,
        type: "imports",
        source: sourceSymbol?.id || `${f.path}::${importName}::import`,
        target: imp, // target is the file path being imported
        file: f.path,
      });
    }
  }

  return edges;
}

/**
 * Map AnalysisReport.issues (bugs + security + performance) → SemanticIssue[]
 */
function mapIssues(report: AnalysisReport): SemanticIssue[] {
  const issues: SemanticIssue[] = [];

  const mapIssue = (
    issue: Issue,
    category: SemanticIssue["category"],
  ): SemanticIssue => ({
    id: issue.id,
    category,
    severity: issue.severity,
    title: issue.title,
    description: issue.description,
    file: issue.file,
    line: issue.line || 1,
    recommendation: issue.recommendation,
    effort: issue.effort,
  });

  // Security issues
  for (const iss of report.issues?.security ?? []) {
    issues.push(mapIssue(iss, "security"));
  }

  // Bug issues
  for (const iss of report.issues?.bugs ?? []) {
    issues.push(mapIssue(iss, "bugs"));
  }

  // Performance issues
  for (const iss of report.issues?.performance ?? []) {
    issues.push(mapIssue(iss, "performance"));
  }

  return issues;
}

/**
 * Map AnalysisReport.deepAnalysis → SemanticInsight[]
 * deepAnalysis is attached at runtime by the AI deep-analysis pipeline.
 */
function mapInsights(report: AnalysisReport): SemanticInsight[] {
  const insights: SemanticInsight[] = [];
  const deep = (report as AnalysisReport & { deepAnalysis?: any }).deepAnalysis;

  if (!deep) return insights;

  // Overview
  if (deep.aiOverview) {
    insights.push({
      type: "overview",
      data: deep.aiOverview,
    });
  }

  // Summary
  if (deep.executiveSummary) {
    insights.push({
      type: "summary",
      data: deep.executiveSummary,
    });
  }

  // Security review
  if (deep.securityReview?.length > 0) {
    insights.push({
      type: "security",
      data: deep.securityReview,
    });
  }

  // Architecture review
  if (deep.architectureReview) {
    insights.push({
      type: "architecture",
      data: deep.architectureReview,
    });
  }

  // Code quality review
  if (deep.codeQualityReview?.length > 0) {
    insights.push({
      type: "quality",
      data: deep.codeQualityReview,
    });
  }

  // Performance review
  if (deep.performanceReview?.length > 0) {
    insights.push({
      type: "performance",
      data: deep.performanceReview,
    });
  }

  // Priorities
  if (deep.priorities?.length > 0) {
    insights.push({
      type: "priorities",
      data: deep.priorities,
    });
  }

  // Best practices
  if (deep.bestPracticesAudit) {
    insights.push({
      type: "bestPractices",
      data: deep.bestPracticesAudit,
    });
  }

  // Duplicates
  if (deep.duplicateAnalysis?.length > 0) {
    insights.push({
      type: "duplicates",
      data: deep.duplicateAnalysis,
    });
  }

  return insights;
}

/**
 * Map AnalysisReport.architecture → SemanticArchitecture
 */
function mapArchitecture(report: AnalysisReport): SemanticArchitecture {
  const arch = report.architecture;
  return {
    pattern: arch?.pattern || "Unknown",
    strengths: arch?.strengths || [],
    weaknesses: arch?.weaknesses || [],
    layers: (arch?.layers || []).map((l) => l.name),
    layerViolations: arch?.metrics?.layerViolations || [],
  };
}

/**
 * Map AnalysisReport → SemanticMetrics
 */
function mapMetrics(
  report: AnalysisReport,
  files: SemanticFile[],
  symbols: SemanticSymbol[],
  edges: SemanticEdge[],
): SemanticMetrics {
  const archMetrics = report.architecture?.metrics;

  return {
    totalFiles: report.totalFiles || files.length,
    totalLines: report.totalLines || files.reduce((sum, f) => sum + f.lines, 0),
    totalSymbols: symbols.length,
    totalEdges: edges.length,
    cyclomaticComplexity: 0, // Not computed in current analysis — placeholder for future
    maintainabilityIndex: report.scores?.maintainability || 0,
    couplingScore: archMetrics?.avgCoupling || 0,
    cohesionScore: archMetrics?.avgCohesion || 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function err(code: string, message: string, details?: unknown): { ok: false; error: AgentError } {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
      recoverable: false,
    },
  };
}
