// CodeInsight AI — Git Intelligence: Diff Reviewer
// Reviews a unified diff for bugs, security issues, performance problems,
// and code-quality concerns. Uses an AI provider when supplied; otherwise
// falls back to a rule-based static analyzer.

import { callAIForJSON, type AIProviderConfig } from "@/lib/agents/ai-client";

export type DiffIssueSeverity = "critical" | "warning" | "info" | "suggestion";

export interface DiffIssue {
  file: string;
  line: number;
  severity: DiffIssueSeverity;
  comment: string;
}

export interface DiffReview {
  /** Overall quality score 0–100. */
  score: number;
  /** One-paragraph summary. */
  summary: string;
  /** Per-line issues found in the diff. */
  issues: DiffIssue[];
  /** Higher-level recommendations. */
  suggestions: string[];
}

interface ReviewRule {
  pattern: RegExp;
  severity: DiffIssueSeverity;
  comment: string;
  penalty: number;
}

/** Static-analysis rules applied to added lines. */
const REVIEW_RULES: ReviewRule[] = [
  {
    pattern: /\beval\s*\(/,
    severity: "critical",
    comment: "Use of eval() is dangerous. Avoid eval entirely.",
    penalty: 25,
  },
  {
    pattern: /(?:api[_-]?key|password|passwd|secret|token|auth)\s*[:=]\s*["'][^"']{8,}["']/i,
    severity: "critical",
    comment:
      "Possible hardcoded secret. Move credentials to environment variables and never commit them.",
    penalty: 25,
  },
  {
    pattern: /\binnerHTML\s*=/,
    severity: "warning",
    comment: "Direct innerHTML assignment can cause XSS. Use textContent or a sanitization helper.",
    penalty: 5,
  },
  {
    pattern: /\bdocument\.write\s*\(/,
    severity: "warning",
    comment: "document.write is dangerous and blocks rendering. Remove it.",
    penalty: 5,
  },
  {
    pattern: /\bsetTimeout\s*\(\s*["'`]/,
    severity: "warning",
    comment: "setTimeout with a string argument is equivalent to eval. Pass a function instead.",
    penalty: 5,
  },
  {
    pattern: /\bnew\s+Function\s*\(/,
    severity: "warning",
    comment: "new Function() is equivalent to eval. Avoid dynamic code generation.",
    penalty: 5,
  },
  {
    pattern: /\bconsole\.log\b/,
    severity: "info",
    comment: "Debug console.log detected. Remove before merging to production.",
    penalty: 3,
  },
  {
    pattern: /\bconsole\.(debug|info|warn|error)\b/,
    severity: "info",
    comment: "Debug console statement. Remove or route through a logger.",
    penalty: 1,
  },
  {
    pattern: /\b(TODO|FIXME|HACK|XXX|BUG)\b/,
    severity: "info",
    comment: "TODO/FIXME marker found. Address before merging or convert to a tracked issue.",
    penalty: 2,
  },
  {
    pattern: /:\s*any\b/,
    severity: "suggestion",
    comment: "Use of 'any' type. Provide a more specific type.",
    penalty: 1,
  },
  {
    pattern: /\bas\s+any\b/,
    severity: "suggestion",
    comment: "'as any' cast bypasses the type system. Use a proper type assertion.",
    penalty: 1,
  },
  {
    pattern: /\b@ts-ignore\b/,
    severity: "suggestion",
    comment: "@ts-ignore suppresses TypeScript errors. Use @ts-expect-error with a justification.",
    penalty: 2,
  },
  {
    pattern: /\bdebugger\b/,
    severity: "warning",
    comment: "debugger statement left in code. Remove before merging.",
    penalty: 5,
  },
  {
    pattern: /\bvar\s+/,
    severity: "suggestion",
    comment: "Use let/const instead of var to avoid hoisting-related bugs.",
    penalty: 1,
  },
];

export class DiffReviewer {
  /**
   * Review a unified diff. Uses AI if a provider is supplied; otherwise
   * falls back to the rule-based static analyzer.
   */
  async reviewDiff(diff: string, provider?: AIProviderConfig): Promise<DiffReview> {
    if (provider) {
      return this.reviewWithAI(diff, provider);
    }
    return this.reviewRuleBased(diff);
  }

  private async reviewWithAI(diff: string, provider: AIProviderConfig): Promise<DiffReview> {
    const truncated =
      diff.length > 8000 ? diff.slice(0, 8000) + "\n... [diff truncated]" : diff;

    const messages = [
      {
        role: "system" as const,
        content:
          "You are a senior code reviewer. Review the diff and return STRICT JSON: " +
          '{"score":<0-100>,"summary":"<paragraph>","issues":[{"file":"","line":0,' +
          '"severity":"critical|warning|info|suggestion","comment":""}],' +
          '"suggestions":["..."]}. ' +
          "Focus on bugs, security, performance, and maintainability. Omit empty arrays.",
      },
      {
        role: "user" as const,
        content: `Review this diff:\n\n${truncated}`,
      },
    ];

    try {
      const result = await callAIForJSON<DiffReview>(provider, messages, {
        temperature: 0.3,
        maxTokens: 1500,
      });
      return {
        score: typeof result.score === "number" ? Math.max(0, Math.min(100, result.score)) : 70,
        summary: typeof result.summary === "string" ? result.summary : "AI review completed.",
        issues: Array.isArray(result.issues)
          ? result.issues.filter((i) => i && typeof i.file === "string")
          : [],
        suggestions: Array.isArray(result.suggestions)
          ? result.suggestions.filter((s) => typeof s === "string")
          : [],
      };
    } catch {
      return this.reviewRuleBased(diff);
    }
  }

  private reviewRuleBased(diff: string): Promise<DiffReview> {
    const issues: DiffIssue[] = [];
    const suggestions: string[] = [];
    let score = 100;

    const lines = diff.split("\n");
    let currentFile = "";
    let newLineNum = 0;

    for (const line of lines) {
      // Track current file from "+++ b/path" headers.
      const fileMatch = line.match(/^\+\+\+\s+b\/(.+)$/);
      if (fileMatch) {
        currentFile = fileMatch[1];
        newLineNum = 0;
        continue;
      }

      // Track new-file line numbers from "@@ -a,b +c,d @@" hunk headers.
      if (line.startsWith("@@")) {
        const match = line.match(/\+(\d+)/);
        newLineNum = match ? parseInt(match[1], 10) - 1 : 0;
        continue;
      }

      // Apply rules to added lines only.
      if (line.startsWith("+") && !line.startsWith("+++")) {
        newLineNum++;
        const added = line.slice(1);

        for (const rule of REVIEW_RULES) {
          if (rule.pattern.test(added)) {
            issues.push({
              file: currentFile,
              line: newLineNum,
              severity: rule.severity,
              comment: rule.comment,
            });
            score -= rule.penalty;
          }
        }
      }
    }

    // High-level suggestions.
    if (diff.length < 50) {
      suggestions.push("Diff is very small — verify the change is complete.");
    }
    if (issues.some((i) => i.severity === "critical")) {
      suggestions.push("Critical issues detected. Block merge until resolved.");
    } else if (issues.length > 0) {
      suggestions.push(`${issues.length} potential issue(s) detected. Review before merging.`);
    } else {
      suggestions.push("No obvious issues detected by static analysis. Proceed to manual review.");
    }

    if (score < 0) score = 0;

    return Promise.resolve({
      score,
      summary: `Reviewed diff. Found ${issues.length} issue(s). Score: ${score}/100.`,
      issues,
      suggestions,
    });
  }
}

/** Singleton diff reviewer instance. */
export const diffReviewer = new DiffReviewer();
