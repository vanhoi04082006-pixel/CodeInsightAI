// CodeInsight AI — Git Intelligence: Changelog Generator
// Produces a Markdown changelog from a list of commits, grouped by
// Conventional-Commit type. AI-polished when a provider is supplied.

import { callAI, type AIProviderConfig } from "@/lib/agents/ai-client";
import { gitOps, type Commit } from "./git-operations";

const TYPE_LABELS: Record<string, string> = {
  feat: "✨ Features",
  fix: "🐛 Bug Fixes",
  perf: "⚡ Performance",
  refactor: "♻️ Code Refactoring",
  docs: "📚 Documentation",
  style: "💎 Styles",
  test: "🧪 Tests",
  ci: "👷 Continuous Integration",
  build: "📦 Build System",
  chore: "🔧 Chores",
  revert: "⏪ Reverts",
  other: "Other Changes",
};

const TYPE_ORDER = [
  "feat",
  "fix",
  "perf",
  "refactor",
  "docs",
  "style",
  "test",
  "ci",
  "build",
  "chore",
  "revert",
  "other",
];

interface ParsedCommit {
  sha: string;
  type: string;
  scope?: string;
  description: string;
  breaking?: boolean;
  raw: string;
}

/** Parse a Conventional Commit message into its parts. */
function parseCommitMessage(message: string): { type: string; scope?: string; description: string; breaking?: boolean } {
  // Format: "type(scope)!: description"
  const match = message.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);
  if (match) {
    return {
      type: match[1].toLowerCase(),
      scope: match[2] || undefined,
      description: match[4],
      breaking: match[3] === "!" || /BREAKING CHANGE/i.test(message),
    };
  }
  return { type: "other", description: message.split("\n")[0] };
}

/** Group commits by type. */
function groupCommits(commits: Commit[]): ParsedCommit[] {
  return commits.map((c) => {
    const parsed = parseCommitMessage(c.message);
    return {
      sha: c.sha.slice(0, 7),
      type: parsed.type,
      scope: parsed.scope,
      description: parsed.description,
      breaking: parsed.breaking,
      raw: c.message,
    };
  });
}

function generateChangelogRuleBased(commits: Commit[]): string {
  const parsed = groupCommits(commits);
  const grouped: Record<string, ParsedCommit[]> = {};
  for (const p of parsed) {
    if (!grouped[p.type]) grouped[p.type] = [];
    grouped[p.type].push(p);
  }

  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [`## ${today}`, ""];

  // Breaking changes section first.
  const breaking = parsed.filter((p) => p.breaking);
  if (breaking.length > 0) {
    lines.push("### 💥 Breaking Changes", "");
    for (const c of breaking) {
      const scope = c.scope ? `**${c.scope}**: ` : "";
      lines.push(`- ${scope}${c.description} (${c.sha})`);
    }
    lines.push("");
  }

  const types = Object.keys(grouped).sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a);
    const ib = TYPE_ORDER.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  for (const type of types) {
    if (type === "other" && grouped[type].length === 0) continue;
    const label = TYPE_LABELS[type] || "Other Changes";
    lines.push(`### ${label}`, "");
    for (const c of grouped[type]) {
      const scope = c.scope ? `**${c.scope}**: ` : "";
      lines.push(`- ${scope}${c.description} (${c.sha})`);
    }
    lines.push("");
  }

  if (parsed.length === 0) {
    lines.push("_No commits in this range._", "");
  }

  return lines.join("\n");
}

async function generateChangelogWithAI(
  commits: Commit[],
  provider: AIProviderConfig
): Promise<string> {
  const ruleBased = generateChangelogRuleBased(commits);

  // Include just the commit summaries to keep the prompt small.
  const commitList = commits
    .slice(0, 50)
    .map((c) => `- ${c.sha.slice(0, 7)}: ${c.message.split("\n")[0]}`)
    .join("\n");

  const messages = [
    {
      role: "system" as const,
      content:
        "You are a technical writer producing a project changelog in Markdown. " +
        "Group entries by Conventional Commit type. Keep entries concise and user-facing. " +
        "Return ONLY the markdown — no explanation.",
    },
    {
      role: "user" as const,
      content: `Commits in this release:\n${commitList}\n\nDraft (rule-based):\n\n${ruleBased}`,
    },
  ];

  try {
    const polished = await callAI(provider, messages, {
      temperature: 0.4,
      maxTokens: 1500,
    });
    if (!polished || polished.trim().length === 0) return ruleBased;
    // Ensure a top-level header.
    if (!polished.trim().startsWith("# ")) {
      return `# Changelog\n\n${polished}`;
    }
    return polished;
  } catch {
    return ruleBased;
  }
}

/**
 * Generate a Markdown changelog from a list of commits.
 * Uses an AI provider to polish the output if supplied; otherwise emits a
 * rule-based changelog grouped by Conventional Commit type.
 */
export async function generateChangelog(
  commits: Commit[],
  provider?: AIProviderConfig
): Promise<string> {
  if (provider) {
    return generateChangelogWithAI(commits, provider);
  }
  return generateChangelogRuleBased(commits);
}

/**
 * Generate a changelog for all commits between `fromSha` (exclusive) and
 * `toSha` (inclusive).
 */
export async function generateChangelogBetween(
  fromSha: string,
  toSha: string,
  cwd?: string,
  provider?: AIProviderConfig
): Promise<string> {
  let commits: Commit[];
  try {
    commits = await gitOps.getCommitsBetween(fromSha, toSha, cwd);
  } catch {
    // Fallback: load recent commits and filter manually.
    const recent = await gitOps.getRecentCommits(100, cwd);
    commits = [];
    let foundTo = false;
    for (const c of recent) {
      if (c.sha === toSha || c.sha.startsWith(toSha)) foundTo = true;
      if (foundTo) commits.push(c);
      if (c.sha === fromSha || c.sha.startsWith(fromSha)) break;
    }
  }

  return generateChangelog(commits, provider);
}
