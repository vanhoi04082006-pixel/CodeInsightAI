// CodeInsight AI — Shared domain types
// AI-powered code intelligence SaaS platform (BYOK + Platform AI).

export type View =
  | "landing"
  | "dashboard"
  | "analyze"
  | "project"
  | "chat"
  | "history"
  | "settings"
  | "providers"
  | "personalities"
  | "admin";

/* ---------- AI Providers (BYOK + Platform AI, server-side encrypted) ---------- */
export type ProviderId =
  | "openrouter"
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "groq"
  | "ollama"
  | "lmstudio"
  | "azure"
  | "together"
  | "fireworks"
  | "mistral"
  | "xai"
  | "shopaikey"
  | "custom";

export type FeatureKind =
  | "chat"
  | "bugs"
  | "security"
  | "performance"
  | "architecture"
  | "docs"
  | "vision"
  | "refactor"
  | "summary";

export interface AIProvider {
  id: string;            // instance id (uuid)
  providerId: ProviderId;
  label: string;         // user-chosen display name
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;   // 0..2
  maxTokens: number;     // -1 = unlimited
  streaming: boolean;
  timeout: number;       // seconds
  enabled: boolean;
  // runtime status (not persisted, but kept for the dashboard)
  status?: "unknown" | "connected" | "error" | "testing";
  latencyMs?: number;
  lastCheckedAt?: number;
  error?: string;
}

export interface ModelInfo {
  id: string;
  useCase: "analyze" | "chat" | "fast" | "deep" | "code" | "vision" | "budget";
  badge: string; // short label: "Best for Analyze", "Fastest", etc.
  maxTokens: number;
}

export interface ProviderPreset {
  providerId: ProviderId;
  name: string;
  category: string;
  defaultBaseUrl: string;
  docsUrl: string;
  defaultModel: string;
  models: string[];
  modelInfo?: ModelInfo[]; // detailed model metadata (use-case, maxTokens)
  requiresKey: boolean;
  accent: string;
  local: boolean; // runs locally (ollama, lmstudio)
}

export interface LanguageStat {
  name: string;
  percentage: number;
  color: string;
  files: number;
  lines: number;
}

export interface FrameworkInfo {
  name: string;
  version: string;
  category: string;
  confidence: number;
}

export interface DependencyNode {
  id: string;
  label: string;
  type: "core" | "service" | "util" | "component" | "config" | "entry";
  group: number;
  x: number;
  y: number;
  size: number;
}

export interface DependencyEdge {
  from: string;
  to: string;
  weight: number;
  circular?: boolean;
}

export interface Issue {
  id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  title: string;
  description: string;
  file: string;
  line?: number;
  recommendation: string;
  effort: "trivial" | "small" | "medium" | "large";
}

export interface FileInsight {
  path: string;
  language: string;
  lines: number;
  complexity: number;
  maintainability: number;
  description: string;
  issues: number;
  snippet?: string; // representative code snippet for the viewer
  duplicateGroup?: number; // >0 means part of a duplicate cluster
  isDeadCode?: boolean;
  // IDE-grade Code Explorer fields (backward-compatible — all optional)
  functions?: string[];
  classes?: string[];
  imports?: string[];
  exports?: string[];
  functionSignatures?: {
    name: string;
    params: string[];
    returnType?: string;
    isAsync: boolean;
    isExported: boolean;
    startLine: number;
    endLine: number;
  }[];
}

export interface CodeSnippet {
  file: string;
  language: string;
  code: string;
  title: string;
  explanation: string;
  // IDE-grade Code Explorer fields (backward-compatible — all optional)
  startLine?: number;     // 1-based first line shown in the snippet
  endLine?: number;       // 1-based last line shown in the snippet
  totalLines?: number;    // total lines in the file (for "Showing X-Y of Z")
  rawContent?: string;    // entire file content (for "Open Full File")
  issueId?: string;       // id of the primary issue this snippet points to (if any)
}

/** AI exploration modes available in the Code Explorer toolbar. */
export type AIMode =
  | "explain"
  | "security"
  | "performance"
  | "refactor"
  | "tests"
  | "bugs";

export interface DiagramSet {
  uml: string;
  sequence: string;
  erd: string;
  umlExplanation: string;
  sequenceExplanation: string;
  erdExplanation: string;
  hasUml?: boolean;
  hasSequence?: boolean;
  hasErd?: boolean;
}

export interface ScoreBreakdown {
  label: string;
  score: number;
  max: number;
  weight: number;
}

export interface ChartPoint {
  label: string;
  value: number;
}

export interface AnalysisReport {
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  repoBranch: string;
  summary: string;
  tags: string[];
  scores: {
    overall: number;
    security: number;
    performance: number;
    architecture: number;
    maintainability: number;
    codeQuality: number;
  };
  scoreBreakdown: ScoreBreakdown[];
  primaryLanguage: string;
  totalFiles: number;
  totalLines: number;
  languages: LanguageStat[];
  frameworks: FrameworkInfo[];
  dependencies: {
    nodes: DependencyNode[];
    edges: DependencyEdge[];
    circular: { nodes: string[] }[];
  };
  issues: {
    bugs: Issue[];
    security: Issue[];
    performance: Issue[];
  };
  files: FileInsight[];
  snippets: CodeSnippet[];
  diagrams: DiagramSet;
  deadCode: { path: string; lines: number; reason: string }[];
  duplicates: { group: number; files: string[]; lines: number }[];
  maintainabilityTrend: ChartPoint[];
  architecture: {
    pattern: string;
    description: string;
    layers: { name: string; responsibility: string; files: number }[];
    strengths: string[];
    weaknesses: string[];
    metrics?: {
      avgCoupling: number;
      avgCohesion: number;
      instability: number;
      abstractness: number;
      distanceFromMain: number;
      fanInAvg: number;
      fanOutAvg: number;
      layerViolations: string[];
      godModules: string[];
      dirCircularDeps: string[];
      fileCircularDeps: number;
    };
  };
  technicalDebt: {
    score: number;
    items: { title: string; impact: string; estimate: string }[];
  };
  roadmap: {
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    category: string;
  }[];
  monetization: {
    title: string;
    description: string;
    potential: "high" | "medium" | "low";
  }[];
  documentation: {
    readme: string;
    apiDocs: string;
    architectureMd: string;
    folderGuide: string;
    componentGuide: string;
    deploymentGuide: string;
  };
  perfPositiveFindings?: string[]; // shown when no perf issues found
  activity: ChartPoint[];
  complexityTrend: ChartPoint[];
}

export interface AnalysisStage {
  id: string;
  label: string;
  description: string;
  icon: string;
  duration: number; // ms
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface AnalysisRecord {
  id: string;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  repoBranch: string;
  status: string;
  overallScore: number;
  securityScore: number;
  performanceScore: number;
  architectureScore: number;
  maintainabilityScore: number;
  codeQualityScore: number;
  primaryLanguage: string | null;
  totalFiles: number;
  totalLines: number;
  languages: string[];
  frameworks: string[];
  report: AnalysisReport | null;
  createdAt: string;
}

/* ---------- AI Deep Analysis — structured output (Wave 6 Phase 1) ----------
 * Backward-compatible: every new field is OPTIONAL. Existing data without
 * evidence / confidence / fixPlan / severity continues to render unchanged.
 */

/** A single AI finding — used by security, code-quality, and performance reviews. */
export interface AIFinding {
  // Legacy fields (kept for backward compatibility)
  issue: string;
  rootCause?: string;
  fixCode?: string;
  impact?: string;
  expectedImprovement?: string;
  // Wave 6 Phase 1 — structured enterprise output
  evidence?: string[];      // exact "file:line" references, e.g. ["src/auth.ts:42"]
  confidence?: number;      // 0.0–1.0 (how confident the AI is this is a real issue)
  fixPlan?: string[];       // step-by-step fix instructions
  severity?: "critical" | "high" | "medium" | "low";  // AI-assigned severity (may differ from static rule)
}

/** Top-level AI overview pass — executive-level decision intelligence. */
export interface AIOverview {
  topRisks: Array<{
    title: string;
    description: string;
    severity: "critical" | "high" | "medium" | "low";
    evidence?: string[];
  }>;
  quickWins: Array<{
    title: string;
    description: string;
    effort: "small" | "medium" | "large";
    evidence?: string[];
  }>;
  fixFirst: string;          // what to fix first and why
  fastestScoreGain: string;  // what will improve the score fastest
  healthAssessment: string;  // 2-3 sentence overall health narrative
}

/* ---------- Phase 2 (P2.3): Enhanced Roadmap Agent types ----------
 * Backward-compatible: all new fields are OPTIONAL. Existing priorities
 * without effortHours/releasePhase still render unchanged.
 *
 * A deterministic post-processor (`src/lib/roadmap-sequencer.ts`) validates
 * the AI output: drops invalid dependsOn refs, breaks cycles, promotes
 * releasePhase when dependencies require it, and re-sums effort per phase.
 */

/** Release phases — used by priorities AND roadmap phases. P0 = now, P3 = backlog. */
export type ReleasePhase = "P0" | "P1" | "P2" | "P3";

/** Effort band — coarse-grained companion to effortHours. */
export type EffortBand = "trivial" | "small" | "medium" | "large" | "xl";

/** Enhanced priority — superset of the legacy priorities[]. Fields are backward-compatible. */
export interface EnhancedPriority {
  // Existing (kept for backward compatibility)
  issue: string;
  businessImpact: string;
  recommendation: string;
  evidence?: string[];
  confidence?: number;
  severity?: "critical" | "high" | "medium" | "low";
  fixPlan?: string[];
  // NEW (Phase 2 — P2.3)
  effortHours?: number;       // 0.5, 1, 2, 4, 8, 16, 40 — Fibonacci-ish
  effortBand?: EffortBand;    // trivial | small | medium | large | xl (matches effortHours)
  roiScore?: number;          // 0-100 (business impact / effort — higher = better ROI)
  releasePhase?: ReleasePhase; // P0=now, P1=this sprint, P2=next, P3=backlog
  dependsOn?: string[];       // titles of other priorities that MUST be done first
  blocks?: string[];          // titles of priorities this unblocks
}

/** A roadmap phase — typed P0–P3 (was freeform string pre-P2.3). */
export interface RoadmapPhase {
  phase: ReleasePhase;
  title?: string;                       // e.g. "Critical Security Fixes"
  tasks: string[];
  estimatedEffortHours?: number;        // sum of member priorities' effortHours
  blockedBy?: ReleasePhase[];           // which phases must complete first (empty for P0)
}

/* ---------- Phase 2 (P2.2): Analysis Timeline + Diff ----------
 * Result of diffAnalyses(fromReport, toReport) — used by:
 *   - /api/analysis/diff        — explicit from/to comparison
 *   - /api/analysis/regressions — auto-picks previous analysis, computes diff
 *   - TimelineTab UI           — renders score trajectory + diff view
 *
 * Re-exported here from analysis-diff.ts so callers can `import type {
 * AnalysisDiffResult } from "@/lib/types"` consistently with other domain
 * types. The implementation (including jaccardSimilarity) lives in
 * src/lib/analysis-diff.ts.
 */
export type { AnalysisDiffResult } from "./analysis-diff";
