// CodeInsight AI — Analysis Manifest
// Single Source of Truth for UI rendering.
// UI reads from this manifest, never hardcodes pass lists, counts, or status.

import type { AnalysisReport } from "./types";

// ─── Pipeline Definition (backend authoritative) ───

export interface AnalysisPassDef {
  type: string;
  /** i18n key suffix: t("analysis", `passes.${type}`) */
  labelKey: string;
  /** Which tab this pass enriches */
  tab: string;
  /** Whether this pass requires AI (vs static-only) */
  requiresAI: boolean;
}

/**
 * The authoritative list of analysis passes.
 * Backend (ai-pass/route.ts) and UI (analyze-view.tsx) MUST use this.
 * Adding a new pass = add here + add case in backend → UI auto-updates.
 */
export const ANALYSIS_PASSES: AnalysisPassDef[] = [
  { type: "overview", labelKey: "passes.overview", tab: "overview", requiresAI: true },
  { type: "summary", labelKey: "passes.summary", tab: "overview", requiresAI: true },
  { type: "priorities", labelKey: "passes.priorities", tab: "roadmap", requiresAI: true },
  { type: "security", labelKey: "passes.security", tab: "security", requiresAI: true },
  { type: "architecture", labelKey: "passes.architecture", tab: "architecture", requiresAI: true },
  { type: "quality", labelKey: "passes.quality", tab: "bugs", requiresAI: true },
  { type: "performance", labelKey: "passes.performance", tab: "performance", requiresAI: true },
  { type: "bestPractices", labelKey: "passes.bestPractices", tab: "architecture", requiresAI: true },
  { type: "duplicates", labelKey: "passes.duplicates", tab: "codegraph", requiresAI: true },
];

// ─── Manifest Types ───

export type PassStatus = "pending" | "running" | "completed" | "failed" | "skipped" | "not_applicable";

export interface AnalysisPassState {
  type: string;
  labelKey: string;
  tab: string;
  status: PassStatus;
  requiresAI: boolean;
}

export interface AnalysisMetrics {
  bugs: number;
  security: number;
  performance: number;
  files: number;
  lines: number;
  languages: number;
  frameworks: number;
  deadCode: number;
  duplicates: number;
  cycles: number;
  overallScore: number;
}

export interface AnalysisManifest {
  analysisId: string | null;
  status: "idle" | "running" | "completed" | "failed";
  aiEnabled: boolean;
  passes: AnalysisPassState[];
  completedPassCount: number;
  totalPassCount: number;
  metrics: AnalysisMetrics;
  artifacts: {
    hasGraph: boolean;
    hasDiagrams: boolean;
    hasDocs: boolean;
    hasDeepAnalysis: boolean;
    hasAiOverview: boolean;
  };
  timestamps: {
    startedAt?: string;
    finishedAt?: string;
  };
}

// ─── Manifest Builder (from AnalysisReport) ───

export function buildManifest(report: AnalysisReport | null, analysisId?: string | null): AnalysisManifest {
  if (!report) {
    return {
      analysisId: analysisId ?? null,
      status: "idle",
      aiEnabled: false,
      passes: ANALYSIS_PASSES.map(p => ({ ...p, status: "pending" as PassStatus })),
      completedPassCount: 0,
      totalPassCount: ANALYSIS_PASSES.length,
      metrics: { bugs: 0, security: 0, performance: 0, files: 0, lines: 0, languages: 0, frameworks: 0, deadCode: 0, duplicates: 0, cycles: 0, overallScore: 0 },
      artifacts: { hasGraph: false, hasDiagrams: false, hasDocs: false, hasDeepAnalysis: false, hasAiOverview: false },
      timestamps: {},
    };
  }

  const r = report as any;
  const aiStatus: string = r.aiStatus || "none";
  const completedPasses: string[] = r._aiPassesCompleted || [];
  const deep = r.deepAnalysis;
  const isRunning = aiStatus === "pending";

  // Build pass states from backend data
  const passes: AnalysisPassState[] = ANALYSIS_PASSES.map(def => {
    // Check if this pass has data in deepAnalysis
    const hasData = checkPassHasData(def.type, deep, r);
    
    if (completedPasses.includes(def.type)) {
      return { ...def, status: "completed" as PassStatus };
    }
    if (hasData) {
      return { ...def, status: "completed" as PassStatus };
    }
    if (aiStatus === "none") {
      return { ...def, status: "not_applicable" as PassStatus };
    }
    if (aiStatus === "done") {
      // AI finished but this pass has no data → failed
      return { ...def, status: "failed" as PassStatus };
    }
    if (isRunning) {
      return { ...def, status: "pending" as PassStatus };
    }
    return { ...def, status: "pending" as PassStatus };
  });

  const completedCount = passes.filter(p => p.status === "completed").length;

  // Build metrics from report (not hardcoded)
  const metrics: AnalysisMetrics = {
    bugs: r.issues?.bugs?.length ?? 0,
    security: r.issues?.security?.length ?? 0,
    performance: r.issues?.performance?.length ?? 0,
    files: r.totalFiles ?? 0,
    lines: r.totalLines ?? 0,
    languages: r.languages?.length ?? 0,
    frameworks: r.frameworks?.length ?? 0,
    deadCode: r.deadCode?.length ?? 0,
    duplicates: r.duplicates?.length ?? 0,
    cycles: r.dependencies?.circular?.length ?? 0,
    overallScore: r.scores?.overall ?? 0,
  };

  // Build artifacts flags
  const artifacts = {
    hasGraph: !!(r.dependencies?.nodes?.length || r.files?.length),
    hasDiagrams: !!(r.diagrams?.uml || r.diagrams?.sequence || r.diagrams?.erd),
    hasDocs: !!(r.documentation?.readme || r.documentation?.apiDocs),
    hasDeepAnalysis: !!deep,
    hasAiOverview: !!deep?.aiOverview,
  };

  return {
    analysisId: analysisId ?? (r.id ?? null),
    status: aiStatus === "done" ? "completed" : aiStatus === "pending" ? "running" : aiStatus === "failed" ? "failed" : "idle",
    aiEnabled: aiStatus !== "none",
    passes,
    completedPassCount: completedCount,
    totalPassCount: ANALYSIS_PASSES.length,
    metrics,
    artifacts,
    timestamps: {
      startedAt: r.createdAt,
      finishedAt: aiStatus === "done" || aiStatus === "failed" ? r.updatedAt : undefined,
    },
  };
}

/** Check if a pass has data in the report's deepAnalysis */
function checkPassHasData(passType: string, deep: any, report: any): boolean {
  if (!deep) return false;
  switch (passType) {
    case "overview": return !!deep.aiOverview;
    case "summary": return !!deep.executiveSummary || !!report.aiEnhancement?.aiSummary;
    case "security": return !!(deep.securityReview?.length);
    case "architecture": return !!deep.architectureReview;
    case "quality": return !!(deep.codeQualityReview?.length);
    case "performance": return !!(deep.performanceReview?.length);
    case "priorities": return !!(deep.priorities?.length) || !!(deep.roadmap?.length);
    case "bestPractices": return !!deep.bestPracticesAudit;
    case "duplicates": return !!(deep.duplicateAnalysis?.length);
    default: return false;
  }
}

// ─── Tab Definition (derived from passes, not hardcoded) ───

export interface TabDef {
  id: string;
  labelKey: string;
  /** Which passes enrich this tab */
  passTypes: string[];
  /** Function to get count badge for this tab */
  getCount?: (report: AnalysisReport) => number;
}

export const ANALYSIS_TABS: TabDef[] = [
  { id: "overview", labelKey: "overview", passTypes: ["overview", "summary"], getCount: () => 0 },
  { id: "architecture", labelKey: "architecture", passTypes: ["architecture", "bestPractices"], getCount: () => 0 },
  { id: "bugs", labelKey: "bugs", passTypes: ["quality"], getCount: (r) => r.issues?.bugs?.length ?? 0 },
  { id: "security", labelKey: "security", passTypes: ["security"], getCount: (r) => r.issues?.security?.length ?? 0 },
  { id: "performance", labelKey: "performance", passTypes: ["performance"], getCount: (r) => r.issues?.performance?.length ?? 0 },
  { id: "codegraph", labelKey: "codegraph", passTypes: ["duplicates"], getCount: (r) => r.dependencies?.nodes?.length ?? 0 },
  { id: "code", labelKey: "code", passTypes: [], getCount: () => 0 },
  { id: "docs", labelKey: "docs", passTypes: [], getCount: () => 0 },
  { id: "roadmap", labelKey: "roadmap", passTypes: ["priorities"], getCount: () => 0 },
  { id: "timeline", labelKey: "timeline.title", passTypes: [], getCount: () => 0 },
];
