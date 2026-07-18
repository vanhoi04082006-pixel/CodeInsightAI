// CodeInsight AI — PR Generator (Prompt 10)
// Generates structured PR descriptions from a git diff + commit list.
// This is a HELPER MODULE, not a BaseAgent subclass (the AgentId type does
// not include "pr-generator" — keeping it as a standalone utility keeps the
// type system clean while still being usable from inside any agent).

import {
  callAIForJSON,
  type AIProviderConfig,
  type AIMessage,
} from "./ai-client";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface CommitInfo {
  hash: string;
  message: string;
  author?: string;
  timestamp?: number;
}

export interface ProjectInfo {
  name: string;
  framework?: string;
  language?: string;
  packageManager?: string;
}

export interface PRDescription {
  title: string;
  description: string;
  breakingChanges: string[];
  migrationGuide: string;
  checklist: string[];
  labels: string[];
  estimatedReviewTime: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Rule-based PR generator — used when no AI provider is configured.
// Robust and deterministic; produces useful output from any diff.
// ────────────────────────────────────────────────────────────────────────────

const CONVENTIONAL_COMMIT_RE =
  /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/i;

const BREAKING_RE =
  /BREAKING[\s-]CHANGE\s*:?\s*([\s\S]+?)(?=\nBREAKING|\n\n|$)/gi;

const FILE_EXT_LABELS: Record<string, string[]> = {
  ".tsx": ["frontend", "react"],
  ".jsx": ["frontend", "react"],
  ".vue": ["frontend", "vue"],
  ".svelte": ["frontend", "svelte"],
  ".css": ["frontend", "styling"],
  ".scss": ["frontend", "styling"],
  ".html": ["frontend"],
  ".ts": ["typescript"],
  ".js": ["javascript"],
  ".py": ["python", "backend"],
  ".go": ["go", "backend"],
  ".rs": ["rust", "backend"],
  ".java": ["java", "backend"],
  ".sql": ["database", "migration"],
  ".prisma": ["database", "schema"],
  ".yml": ["config", "ci-cd"],
  ".yaml": ["config", "ci-cd"],
  ".json": ["config"],
  ".toml": ["config"],
  "dockerfile": ["devops", "docker"],
  ".md": ["documentation"],
  ".test.ts": ["testing"],
  ".test.tsx": ["testing"],
  ".spec.ts": ["testing"],
  ".spec.tsx": ["testing"],
};

const FILE_TYPE_CHECKLIST: Array<{
  test: RegExp;
  item: string;
}> = [
  { test: /\.test\.[tj]sx?$/i, item: "- [ ] All tests pass locally" },
  { test: /\.spec\.[tj]sx?$/i, item: "- [ ] All tests pass locally" },
  { test: /\.sql$/i, item: "- [ ] Database migrations applied and reversible" },
  { test: /\.prisma$/i, item: "- [ ] `prisma migrate dev` succeeds" },
  { test: /dockerfile/i, item: "- [ ] `docker build` succeeds locally" },
  { test: /\.ya?ml$/i, item: "- [ ] CI workflow validated via `act` or a dry-run" },
  { test: /package\.json$/i, item: "- [ ] `npm install` / equivalent is clean" },
  { test: /\.env(\.|$)/i, item: "- [ ] No secrets committed (scan for `.env`)" },
  { test: /api\/|route\.[tj]s/i, item: "- [ ] API endpoints have appropriate auth" },
  { test: /auth|login|session/i, item: "- [ ] Auth flows manually verified" },
];

const FILE_PATH_CHECKLIST: Array<{
  test: RegExp;
  item: string;
}> = [
  { test: /src\/components\//i, item: "- [ ] Component renders correctly in Storybook / dev" },
  { test: /src\/lib\/|src\/utils\//i, item: "- [ ] Public API surfaces documented" },
  { test: /src\/app\/api\//i, item: "- [ ] API responses validated (status codes, schema)" },
  { test: /prisma\/schema/i, item: "- [ ] Schema reviewed by DB owner" },
  { test: /public\//i, item: "- [ ] Static assets optimized (compression, sizes)" },
  { test: /\.github\/workflows\//i, item: "- [ ] CI secrets verified present in repo settings" },
];

function parseCommitType(message: string): {
  type?: string;
  scope?: string;
  breaking: boolean;
  subject: string;
} {
  const firstLine = message.split("\n")[0]?.trim() ?? message;
  const match = firstLine.match(CONVENTIONAL_COMMIT_RE);
  if (match) {
    const [, type, scope, subject] = match;
    // A `!` before the colon indicates a breaking change.
    const breaking = firstLine.includes("!:");
    return { type, scope, breaking, subject };
  }
  return { breaking: false, subject: firstLine };
}

function extractBreakingChanges(commits: CommitInfo[]): string[] {
  const changes: string[] = [];
  for (const c of commits) {
    const matches = [...c.message.matchAll(BREAKING_RE)];
    for (const m of matches) {
      const text = m[1].trim().replace(/\s+/g, " ");
      if (text) changes.push(`${c.hash.slice(0, 7)}: ${text}`);
    }
    // Also catch `type!:` conventional markers
    const { breaking, subject } = parseCommitType(c.message);
    if (breaking) {
      changes.push(`${c.hash.slice(0, 7)}: ${subject}`);
    }
  }
  return changes;
}

function deriveLabels(
  commits: CommitInfo[],
  changedFiles: string[],
): string[] {
  const labels = new Set<string>();

  // From commit types
  for (const c of commits) {
    const { type } = parseCommitType(c.message);
    if (type) {
      const lower = type.toLowerCase();
      const labelMap: Record<string, string> = {
        feat: "feature",
        fix: "bug",
        perf: "performance",
        refactor: "refactor",
        docs: "documentation",
        test: "testing",
        chore: "chore",
        ci: "ci-cd",
        build: "build",
        style: "style",
        revert: "revert",
      };
      const label = labelMap[lower];
      if (label) labels.add(label);
    }
  }

  // From file extensions
  for (const file of changedFiles) {
    const lower = file.toLowerCase();
    if (lower.endsWith("dockerfile") || lower.includes("dockerfile")) {
      labels.add("devops");
    }
    for (const [ext, labelsForExt] of Object.entries(FILE_EXT_LABELS)) {
      if (lower.endsWith(ext)) {
        for (const l of labelsForExt) labels.add(l);
      }
    }
  }

  // Misc heuristics
  if (commits.some((c) => parseCommitType(c.message).breaking)) {
    labels.add("breaking-change");
  }
  if (commits.length > 20) labels.add("large-pr");
  if (commits.length <= 3) labels.add("small-pr");

  return Array.from(labels);
}

function deriveChecklist(changedFiles: string[]): string[] {
  const items = new Set<string>();
  // Default checklist (always present)
  items.add("- [ ] Code follows the project's style guide");
  items.add("- [ ] Self-review of the diff completed");
  items.add("- [ ] Commit messages are clear and follow conventions");
  items.add("- [ ] No console.log / debug code left behind");

  for (const file of changedFiles) {
    for (const { test, item } of FILE_TYPE_CHECKLIST) {
      if (test.test(file)) items.add(item);
    }
    for (const { test, item } of FILE_PATH_CHECKLIST) {
      if (test.test(file)) items.add(item);
    }
  }

  return Array.from(items);
}

function estimateReviewTime(diffBytes: number, commits: number): string {
  // Rough heuristic: ~1 min per 200 lines of diff, +1 min per commit, capped.
  const diffLines = diffBytes / 80; // approx avg line length
  const minutes = Math.min(60, Math.max(3, Math.round(diffLines / 200) + commits));
  if (minutes < 15) return `~${minutes} min (quick skim)`;
  if (minutes < 30) return `~${minutes} min (focused review)`;
  if (minutes < 45) return `~${minutes} min (thorough review)`;
  return `~${minutes} min (deep review — consider splitting the PR)`;
}

function extractChangedFiles(diff: string): string[] {
  const files = new Set<string>();
  const lines = diff.split("\n");
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      // diff --git a/path b/path
      const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (m) {
        files.add(m[2]);
      }
    } else if (line.startsWith("+++ b/")) {
      files.add(line.slice(6));
    } else if (line.startsWith("--- a/")) {
      // skip deletions source; the +++ line above will capture the new path
    }
  }
  return Array.from(files);
}

function ruleBasedGenerate(
  diff: string,
  commits: CommitInfo[],
  projectInfo: ProjectInfo,
): PRDescription {
  const changedFiles = extractChangedFiles(diff);
  const breakingChanges = extractBreakingChanges(commits);
  const labels = deriveLabels(commits, changedFiles);
  const checklist = deriveChecklist(changedFiles);
  const diffBytes = diff.length;

  // Title: prefer the first conventional commit; otherwise "X: first commit subject"
  const firstCommit = commits[0];
  let title: string;
  if (firstCommit) {
    const { type, scope, subject } = parseCommitType(firstCommit.message);
    if (type) {
      const scopePart = scope ? `(${scope})` : "";
      title = `${type}${scopePart}: ${subject}`.slice(0, 72);
    } else {
      title = (firstCommit.message.split("\n")[0] ?? "Update").slice(0, 72);
    }
  } else {
    title = `Update ${projectInfo.name}`;
  }

  // Description: group commits by type
  const byType = new Map<string, CommitInfo[]>();
  for (const c of commits) {
    const { type } = parseCommitType(c.message);
    const key = type ?? "misc";
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key)!.push(c);
  }

  const descriptionParts: string[] = [];
  descriptionParts.push(`## Summary\n\nThis PR includes ${commits.length} commit(s) across ${changedFiles.length} file(s).`);
  descriptionParts.push("");
  descriptionParts.push("## Changes by category");
  for (const [type, cs] of byType) {
    descriptionParts.push(`\n### ${type}`);
    for (const c of cs) {
      const subject = parseCommitType(c.message).subject;
      descriptionParts.push(`- ${c.hash.slice(0, 7)}: ${subject}`);
    }
  }

  if (changedFiles.length > 0) {
    descriptionParts.push("\n## Files changed");
    for (const f of changedFiles.slice(0, 30)) {
      descriptionParts.push(`- \`${f}\``);
    }
    if (changedFiles.length > 30) {
      descriptionParts.push(`- _...and ${changedFiles.length - 30} more_`);
    }
  }

  const migrationGuide = breakingChanges.length
    ? `This PR introduces breaking changes. Please review and update:\n${breakingChanges
        .map((c) => `- ${c}`)
        .join("\n")}`
    : "No breaking changes detected — no migration steps required.";

  return {
    title,
    description: descriptionParts.join("\n"),
    breakingChanges,
    migrationGuide,
    checklist,
    labels,
    estimatedReviewTime: estimateReviewTime(diffBytes, commits.length),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// AI-based PR generator — uses an AI provider for richer descriptions.
// ────────────────────────────────────────────────────────────────────────────

const AI_SYSTEM_PROMPT = `You are a senior staff engineer writing a GitHub pull request description.
Analyze the provided git diff and commit list, then produce a structured JSON object with these exact keys:

- "title": concise PR title (≤72 chars), conventional-commit style preferred
- "description": markdown body — must include a "## Summary" section (2-4 sentences explaining the *why*),
  a "## Changes" section (bullet list of notable changes grouped logically), and a "## Risk" section
  (areas the reviewer should scrutinize most).
- "breakingChanges": string[] — each entry a single-sentence description of a breaking change. Empty if none.
- "migrationGuide": markdown string — concrete steps to migrate. "No migration required." if none.
- "checklist": string[] — GitHub-style checklist items ("- [ ] ...") specific to the files touched.
- "labels": string[] — GitHub labels (lowercase, kebab-case). e.g. ["feature","frontend"].
- "estimatedReviewTime": human-readable string like "~15 min (focused review)".

Return ONLY the JSON object — no surrounding prose, no markdown fences.`;

function buildAIUserPrompt(
  diff: string,
  commits: CommitInfo[],
  projectInfo: ProjectInfo,
): string {
  // Truncate the diff to keep token usage reasonable.
  const MAX_DIFF = 16000;
  const truncatedDiff =
    diff.length > MAX_DIFF
      ? diff.slice(0, MAX_DIFF) +
        `\n\n[... diff truncated, ${diff.length - MAX_DIFF} more bytes omitted ...]`
      : diff;

  const commitBlock = commits
    .map((c) => `${c.hash.slice(0, 7)} | ${c.message.split("\n")[0]}`)
    .join("\n");

  return `Project: ${projectInfo.name}
Language: ${projectInfo.language ?? "unknown"}
Framework: ${projectInfo.framework ?? "unknown"}

## Commits (${commits.length})
${commitBlock}

## Diff
${truncatedDiff}
`;
}

async function aiGenerate(
  diff: string,
  commits: CommitInfo[],
  projectInfo: ProjectInfo,
  provider: AIProviderConfig,
): Promise<PRDescription> {
  const messages: AIMessage[] = [
    { role: "system", content: AI_SYSTEM_PROMPT },
    {
      role: "user",
      content: buildAIUserPrompt(diff, commits, projectInfo),
    },
  ];

  const result = await callAIForJSON<Partial<PRDescription>>(provider, messages, {
    temperature: 0.3,
    maxTokens: 2400,
  });

  // Validate + fill any missing fields with rule-based fallbacks.
  const fallback = ruleBasedGenerate(diff, commits, projectInfo);
  return {
    title: (result.title ?? fallback.title).slice(0, 72),
    description: result.description ?? fallback.description,
    breakingChanges: Array.isArray(result.breakingChanges)
      ? result.breakingChanges
      : fallback.breakingChanges,
    migrationGuide: result.migrationGuide ?? fallback.migrationGuide,
    checklist:
      Array.isArray(result.checklist) && result.checklist.length > 0
        ? result.checklist
        : fallback.checklist,
    labels: Array.isArray(result.labels) ? result.labels : fallback.labels,
    estimatedReviewTime:
      result.estimatedReviewTime ?? fallback.estimatedReviewTime,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// PRGenerator class — single entry point.
// ────────────────────────────────────────────────────────────────────────────

export class PRGenerator {
  /**
   * Generate a structured PR description from a git diff and commit list.
   * Uses AI when a provider is supplied; otherwise falls back to a robust
   * rule-based generator.
   */
  async generate(
    diff: string,
    commits: CommitInfo[],
    projectInfo: ProjectInfo,
    provider?: AIProviderConfig,
  ): Promise<PRDescription> {
    const safeCommits = commits ?? [];
    const safeProject = projectInfo ?? { name: "project" };

    if (!diff && safeCommits.length === 0) {
      return {
        title: "Empty PR",
        description: "No diff or commits were supplied to the PR generator.",
        breakingChanges: [],
        migrationGuide: "No migration required.",
        checklist: ["- [ ] Add a description"],
        labels: [],
        estimatedReviewTime: "~1 min",
      };
    }

    if (provider) {
      try {
        return await aiGenerate(diff, safeCommits, safeProject, provider);
      } catch {
        // Fall back to rule-based on AI failure
      }
    }

    return ruleBasedGenerate(diff, safeCommits, safeProject);
  }
}

// Singleton
export const prGenerator = new PRGenerator();

// ────────────────────────────────────────────────────────────────────────────
// Markdown formatter — produces a ready-to-paste GitHub PR body.
// ────────────────────────────────────────────────────────────────────────────

export function formatPRAsMarkdown(pr: PRDescription): string {
  const sections: string[] = [];

  sections.push(pr.description.trim());

  if (pr.breakingChanges.length > 0) {
    sections.push(`## ⚠️ Breaking Changes\n\n${pr.breakingChanges.map((c) => `- ${c}`).join("\n")}`);
    sections.push(`## 🔁 Migration Guide\n\n${pr.migrationGuide}`);
  } else {
    sections.push(`## 🔁 Migration\n\n${pr.migrationGuide}`);
  }

  if (pr.checklist.length > 0) {
    sections.push(`## ✅ Reviewer Checklist\n\n${pr.checklist.join("\n")}`);
  }

  if (pr.labels.length > 0) {
    sections.push(`## 🏷️ Suggested Labels\n\n${pr.labels.map((l) => `\`${l}\``).join(" ")}`);
  }

  sections.push(`---\n_Estimated review time: **${pr.estimatedReviewTime}**_`);

  return sections.join("\n\n");
}
