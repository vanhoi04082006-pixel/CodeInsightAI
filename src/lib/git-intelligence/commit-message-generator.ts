// CodeInsight AI — Git Intelligence: Commit Message Generator
// Generates Conventional Commits messages from a diff. Uses an AI provider
// when supplied, otherwise falls back to a rule-based heuristic generator.

import { callAIForJSON, type AIProviderConfig } from "@/lib/agents/ai-client";

export interface CommitMessage {
  /** Conventional-commit type: feat | fix | docs | style | refactor | test | chore | perf | ci | build | revert. */
  type: string;
  /** Optional scope (e.g. "auth", "ui"). */
  scope?: string;
  /** Short imperative summary, no "type(scope):" prefix. */
  title: string;
  /** Detailed multi-line body. */
  body: string;
}

interface TypeRule {
  type: string;
  test: (paths: string[]) => boolean;
}

const TYPE_RULES: TypeRule[] = [
  // Documentation-only changes.
  {
    type: "docs",
    test: (p) => p.length > 0 && p.every((f) => /\.(md|mdx|txt|rst)$/.test(f) || f.startsWith("docs/")),
  },
  // Test-only changes.
  {
    type: "test",
    test: (p) =>
      p.length > 0 &&
      p.every(
        (f) =>
          /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f) ||
          f.startsWith("test/") ||
          f.startsWith("tests/") ||
          f.startsWith("__tests__/")
      ),
  },
  // Style-only changes (CSS / SCSS / Less).
  {
    type: "style",
    test: (p) => p.length > 0 && p.every((f) => /\.(css|scss|less|styl)$/.test(f)),
  },
  // Build / CI config.
  {
    type: "chore",
    test: (p) =>
      p.length > 0 &&
      p.every(
        (f) =>
          /\.(json|yml|yaml|toml|lock)$/.test(f) ||
          f.startsWith(".github/") ||
          f.includes("package.json") ||
          f.includes("tsconfig") ||
          f.includes("Dockerfile") ||
          f.startsWith(".vscode/")
      ),
  },
  // Bug fix — heuristic on path keywords.
  {
    type: "fix",
    test: (p) => p.some((f) => /\b(fix|bug|patch|hotfix)\b/i.test(f)),
  },
  // New feature — anything new in src / app / components.
  {
    type: "feat",
    test: (p) =>
      p.some((f) => f.startsWith("src/") || f.startsWith("app/") || f.startsWith("components/")) &&
      p.some((f) => !/\.(test|spec)\./.test(f)),
  },
  // Refactor — code-only changes with no obvious new feature.
  {
    type: "refactor",
    test: (p) => p.length > 0 && p.every((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f)),
  },
];

const FALLBACK_TYPE = "chore";

/** Extract the list of changed file paths from a unified diff. */
function extractFilesFromDiff(diff: string): string[] {
  const matches = diff.match(/^diff --git a\/(.+?) b\/(.+?)$/gm) || [];
  const files: string[] = [];
  for (const m of matches) {
    const line = m.match(/^diff --git a\/(.+?) b\/(.+?)$/);
    if (line) files.push(line[2]);
  }
  if (files.length === 0) {
    // Try alternate format: +++ b/path
    const plusMatches = diff.match(/^\+\+\+ b\/(.+)$/gm) || [];
    for (const m of plusMatches) {
      const line = m.match(/^\+\+\+ b\/(.+)$/);
      if (line && line[1] !== "/dev/null") files.push(line[1]);
    }
  }
  return files;
}

/** Infer a scope from the first changed file path. */
function inferScope(files: string[]): string | undefined {
  if (files.length === 0) return undefined;
  const first = files[0];
  const parts = first.split("/");
  if (parts.length > 1) {
    let scope = parts[0] === "src" ? parts[1] : parts[0];
    scope = scope.replace(/\.(ts|tsx|js|jsx|mjs|cjs|json|md|css|scss)$/, "");
    if (scope && scope.length <= 24) return scope;
  }
  return undefined;
}

function countAdditionsAndDeletions(diff: string): { additions: number; deletions: number } {
  const additions = (diff.match(/^\+[^+]/gm) || []).length;
  const deletions = (diff.match(/^-[^-]/gm) || []).length;
  return { additions, deletions };
}

function generateRuleBased(diff: string): CommitMessage {
  const files = extractFilesFromDiff(diff);
  const { additions, deletions } = countAdditionsAndDeletions(diff);

  let type = FALLBACK_TYPE;
  for (const rule of TYPE_RULES) {
    if (rule.test(files)) {
      type = rule.type;
      break;
    }
  }

  const scope = inferScope(files);

  let summary: string;
  if (files.length === 1) {
    const f = files[0];
    const basename = f.split("/").pop() || f;
    summary = `update ${basename}`;
  } else if (files.length > 1) {
    summary = `update ${files.length} files`;
  } else {
    summary = "apply changes";
  }

  const title = `${type}${scope ? `(${scope})` : ""}: ${summary}`;

  const bodyLines: string[] = [
    `Files changed: ${files.length}`,
    `Additions: +${additions}`,
    `Deletions: -${deletions}`,
  ];
  if (files.length > 0) {
    bodyLines.push("", "Files:");
    for (const f of files.slice(0, 15)) bodyLines.push(`- ${f}`);
    if (files.length > 15) bodyLines.push(`... and ${files.length - 15} more`);
  }

  return { type, scope, title, body: bodyLines.join("\n") };
}

async function generateWithAI(diff: string, provider: AIProviderConfig): Promise<CommitMessage> {
  const truncated =
    diff.length > 8000 ? diff.slice(0, 8000) + "\n... [diff truncated]" : diff;

  const messages = [
    {
      role: "system" as const,
      content:
        "You are a senior software engineer. Generate a Conventional Commits message for the given diff. " +
        "Return STRICT JSON with fields: " +
        '{"type":"feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert","scope":"optional short scope",' +
        '"title":"short imperative summary under 72 chars, no type/scope prefix","body":"detailed description with bullet points"}.',
    },
    {
      role: "user" as const,
      content: `Diff:\n\n${truncated}`,
    },
  ];

  try {
    const result = await callAIForJSON<CommitMessage>(provider, messages, {
      temperature: 0.3,
      maxTokens: 800,
    });
    if (!result || typeof result.title !== "string" || !result.title) {
      throw new Error("AI returned no title");
    }
    return {
      type: typeof result.type === "string" ? result.type : FALLBACK_TYPE,
      scope: typeof result.scope === "string" && result.scope ? result.scope : undefined,
      title: result.title,
      body: typeof result.body === "string" ? result.body : "",
    };
  } catch {
    return generateRuleBased(diff);
  }
}

/**
 * Generate a Conventional Commit message from a diff.
 * Uses an AI provider if supplied; otherwise falls back to a rule-based
 * heuristic that infers the type from changed file paths.
 */
export async function generateCommitMessage(
  diff: string,
  provider?: AIProviderConfig
): Promise<CommitMessage> {
  if (provider) {
    return generateWithAI(diff, provider);
  }
  return generateRuleBased(diff);
}

/** Combine a CommitMessage's title and body into a single commit message string. */
export function formatCommitMessage(msg: CommitMessage): string {
  if (msg.body && msg.body.trim().length > 0) {
    return `${msg.title}\n\n${msg.body}`;
  }
  return msg.title;
}
