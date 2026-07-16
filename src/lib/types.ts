// CodeInsight AI — Shared domain types

export type View =
  | "landing"
  | "dashboard"
  | "analyze"
  | "project"
  | "chat"
  | "history"
  | "settings"
  | "pricing";

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
}

export interface CodeSnippet {
  file: string;
  language: string;
  code: string;
  title: string;
  explanation: string;
}

export interface DiagramSet {
  uml: string; // SVG markup for class/UML diagram
  sequence: string; // SVG markup for sequence diagram
  erd: string; // SVG markup for database ER diagram
  umlExplanation: string;
  sequenceExplanation: string;
  erdExplanation: string;
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
  };
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
