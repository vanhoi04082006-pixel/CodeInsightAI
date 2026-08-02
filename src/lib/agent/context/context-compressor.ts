// CodeInsight AI — Context Compressor (Layer 5)
// Trims, summarizes, and deduplicates context to fit within token budget.

import type { TokenAllocation, ContextNeed } from "../contracts";

export class ContextCompressor {
  /**
   * Compress content to fit within a target token count.
   * Strategy: truncate from the end (keep beginning which is usually more important).
   */
  compress(content: string, targetTokens: number): string {
    if (!content) return "";
    const estimatedTokens = Math.ceil(content.length / 4);
    if (estimatedTokens <= targetTokens) return content;

    // Truncate to fit
    const targetChars = targetTokens * 4;
    const truncated = content.slice(0, targetChars);

    // Add truncation indicator
    const lastNewline = truncated.lastIndexOf("\n");
    const cutPoint = lastNewline > targetChars * 0.8 ? lastNewline : targetChars;
    return content.slice(0, cutPoint) + "\n... [truncated]";
  }

  /**
   * Summarize content by keeping first N lines + last M lines.
   * Useful for large files where middle is less important.
   */
  summarize(content: string, firstN: number = 20, lastM: number = 10): string {
    if (!content) return "";
    const lines = content.split("\n");
    if (lines.length <= firstN + lastM) return content;

    const beginning = lines.slice(0, firstN).join("\n");
    const end = lines.slice(-lastM).join("\n");
    const skipped = lines.length - firstN - lastM;
    return `${beginning}\n\n... [${skipped} lines omitted] ...\n\n${end}`;
  }

  /**
   * Deduplicate content pieces — remove exact duplicates.
   * Returns deduplicated array.
   */
  deduplicate(contents: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const content of contents) {
      const normalized = content.trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(content);
      }
    }
    return result;
  }

  /**
   * Extract key lines from content (lines with important keywords).
   * Useful for issue descriptions, recommendations, etc.
   */
  extractKeyLines(content: string, keywords: string[] = ["error", "fail", "critical", "warning", "todo", "fixme"]): string {
    if (!content) return "";
    const lines = content.split("\n");
    const keyLines = lines.filter((line) => {
      const lower = line.toLowerCase();
      return keywords.some((kw) => lower.includes(kw));
    });
    return keyLines.join("\n");
  }
}
