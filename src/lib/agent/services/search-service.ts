// CodeInsight AI — Search Service (Layer 3)
// Text search over SPM file contents. Supports plain text, regex, language filter.

import type {
  SemanticProjectModel,
  SearchService as ISearchService,
  SearchOptions,
  SearchResult,
  Result,
  AgentError,
} from "../contracts";

export class SearchServiceImpl implements ISearchService {
  private indexedFiles: Map<string, string> = new Map();
  private indexedSpmId: string | null = null;

  /** Index SPM files for fast search. */
  index(spm: SemanticProjectModel): Result<void> {
    try {
      this.indexedFiles.clear();
      for (const file of spm.files) {
        if (file.content) {
          this.indexedFiles.set(file.path, file.content);
        }
      }
      this.indexedSpmId = spm.id;
      return ok(undefined);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Failed to index: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Search file contents for a query. Returns matching lines with scores. */
  search(
    query: string,
    spm: SemanticProjectModel,
    options?: SearchOptions,
  ): Result<SearchResult[]> {
    try {
      // Auto-index if SPM changed
      if (this.indexedSpmId !== spm.id) {
        const idx = this.index(spm);
        if (!idx.ok) return idx;
      }

      const {
        caseSensitive = false,
        limit = 50,
        language,
        filePattern,
        regex = false,
      } = options || {};

      const results: SearchResult[] = [];
      const searchTerm = caseSensitive ? query : query.toLowerCase();

      let searchRegex: RegExp | null = null;
      if (regex) {
        try {
          searchRegex = new RegExp(query, caseSensitive ? "" : "i");
        } catch {
          return err("TOOL_INVALID_PARAMS", `Invalid regex: ${query}`);
        }
      }

      let fileRegex: RegExp | null = null;
      if (filePattern) {
        const glob = filePattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".");
        fileRegex = new RegExp(`^${glob}$`);
      }

      for (const file of spm.files) {
        if (language && file.language !== language) continue;
        if (fileRegex && !fileRegex.test(file.path)) continue;

        const content = file.content || "";
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const searchLine = caseSensitive ? line : line.toLowerCase();
          const match = searchRegex ? searchRegex.test(line) : searchLine.includes(searchTerm);

          if (match) {
            // Score: exact match = 1.0, case-insensitive = 0.7, regex = 0.8
            let score = 0.7;
            if (regex) score = 0.8;
            if (caseSensitive && line.includes(query)) score = 1.0;

            results.push({
              file: file.path,
              line: i + 1,
              text: line.trim().slice(0, 200),
              score,
            });

            if (results.length >= limit) {
              return ok(results.sort((a, b) => b.score - a.score));
            }
          }
        }
      }

      return ok(results.sort((a, b) => b.score - a.score));
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Search failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

// ─── Helpers ───

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function err(code: string, message: string): { ok: false; error: AgentError } {
  return { ok: false, error: { code, message, recoverable: false } };
}
