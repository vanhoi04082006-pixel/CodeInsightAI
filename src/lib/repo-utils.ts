// CodeInsight AI — Repo URL parser + analysis stage constants
// Extracted from analysis-engine.ts (which was 1115 lines of fake report generators)
// Only these 2 exports are used by the rest of the codebase.

import type { AnalysisStage } from "./types";

/* ---------- Repo URL parsing ---------- */
export interface ParsedRepo {
  owner: string;
  name: string;
  branch: string;
  url: string;
  valid: boolean;
}

export function parseRepoUrl(input: string): ParsedRepo {
  const raw = input.trim();
  const match = raw.match(
    /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?]|$)/i
  );
  if (match) {
    return {
      owner: match[1],
      name: match[2],
      branch: "main",
      url: raw.startsWith("http") ? raw : `https://github.com/${match[1]}/${match[2]}`,
      valid: true,
    };
  }
  // shorthand owner/name
  const short = raw.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (short) {
    return {
      owner: short[1],
      name: short[2],
      branch: "main",
      url: `https://github.com/${short[1]}/${short[2]}`,
      valid: true,
    };
  }
  return { owner: "", name: "", branch: "main", url: raw, valid: false };
}

/* ---------- Analysis stages (visual pipeline) ---------- */
export const ANALYSIS_STAGES: AnalysisStage[] = [
  {
    id: "clone",
    label: "Cloning Repository",
    description: "Fetching source tree & commit history",
    icon: "git-branch",
    duration: 1400,
  },
  {
    id: "scan",
    label: "Scanning File Tree",
    description: "Indexing files, detecting languages",
    icon: "scan",
    duration: 1200,
  },
  {
    id: "ast",
    label: "Generating AST",
    description: "Parsing source into abstract syntax trees",
    icon: "binary",
    duration: 1600,
  },
  {
    id: "deps",
    label: "Building Dependency Graph",
    description: "Resolving imports & module relationships",
    icon: "network",
    duration: 1500,
  },
  {
    id: "embed",
    label: "Creating Embeddings",
    description: "Vectorising code for semantic search",
    icon: "brain",
    duration: 1400,
  },
  {
    id: "static",
    label: "Static Analysis",
    description: "Complexity, duplication, dead code",
    icon: "search-code",
    duration: 1500,
  },
  {
    id: "ai",
    label: "AI Analysis",
    description: "Security, performance & architecture review",
    icon: "sparkles",
    duration: 1800,
  },
  {
    id: "report",
    label: "Generating Reports",
    description: "Synthesising insights & diagrams",
    icon: "file-text",
    duration: 1300,
  },
];
