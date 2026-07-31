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
// Stage labels + descriptions are NOT hardcoded here — they come from i18n:
//   t("analysis", `stages.${stage.id}`)  → stage label
//   t("analysis", `${stage.id}Desc`)     → stage description
// This keeps the visual pipeline in sync with the user's locale.
export const ANALYSIS_STAGES: AnalysisStage[] = [
  { id: "clone", icon: "git-branch", duration: 1400 },
  { id: "scan", icon: "scan", duration: 1200 },
  { id: "ast", icon: "binary", duration: 1600 },
  { id: "deps", icon: "network", duration: 1500 },
  { id: "embed", icon: "brain", duration: 1400 },
  { id: "static", icon: "search-code", duration: 1500 },
  { id: "ai", icon: "sparkles", duration: 1800 },
  { id: "report", icon: "file-text", duration: 1300 },
];
