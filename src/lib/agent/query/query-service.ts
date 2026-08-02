// CodeInsight AI — Semantic Query Service (Layer 2)
//
// Business logic queries on top of SPM + Indexes.
// This is the ONLY module that combines SPM data with Index lookups.
// Services (Layer 3), Tools (Layer 4), and Context Builder (Layer 5) all
// read through this service — never directly from SPM or Indexes.
//
// All methods return Result<T> — never throws.

import type {
  SemanticProjectModel,
  SemanticQueryService,
  SemanticSymbol,
  SemanticEdge,
  SemanticFile,
  SemanticIssue,
  SemanticArchitecture,
  SemanticMetrics,
  SemanticInsight,
  IndexSystem,
  Result,
  AgentError,
  ImpactReport,
  SearchOptions,
  IssueFilter,
  DuplicateGroup,
  DiagramOptions,
  CallChainNode,
} from "../contracts";

// ═══════════════════════════════════════════════════════════════
// Query Service Implementation
// ═══════════════════════════════════════════════════════════════

export class SemanticQueryServiceImpl implements SemanticQueryService {
  constructor(
    private readonly spm: SemanticProjectModel,
    private readonly indexes: IndexSystem,
  ) {}

  // ─── Symbol Queries ───

  findSymbol(name: string): Result<SemanticSymbol[]> {
    return ok(this.indexes.symbol.byName(name));
  }

  findDefinition(symbolId: string): Result<SemanticSymbol | null> {
    return ok(this.indexes.symbol.byId(symbolId));
  }

  findReferences(symbolId: string): Result<SemanticEdge[]> {
    return ok(this.indexes.reference.referencesTo(symbolId));
  }

  findCallers(symbolId: string): Result<SemanticSymbol[]> {
    return ok(this.indexes.call.callers(symbolId));
  }

  findCallees(symbolId: string): Result<SemanticSymbol[]> {
    return ok(this.indexes.call.callees(symbolId));
  }

  findCallChain(entry: string, maxDepth: number = 5): Result<CallChainNode> {
    const chain = this.indexes.call.callChain(entry, maxDepth);
    if (chain.length === 0) {
      return err("SYMBOL_NOT_FOUND", `Symbol not found or no callees: ${entry}`);
    }
    return ok(chain[0]);
  }

  // ─── Impact Analysis ───

  findImpact(symbolId: string): Result<ImpactReport> {
    const root = this.indexes.symbol.byId(symbolId);
    if (!root) {
      return err("SYMBOL_NOT_FOUND", `Symbol not found: ${symbolId}`);
    }

    // Direct impact: symbols that reference this symbol (callers + importers)
    const refsTo = this.indexes.reference.referencesTo(symbolId);
    const directlyImpacted: SemanticSymbol[] = [];
    const directSeen = new Set<string>([symbolId]);

    for (const edge of refsTo) {
      if (directSeen.has(edge.source)) continue;
      const sym = this.indexes.symbol.byId(edge.source);
      if (sym) {
        directlyImpacted.push(sym);
        directSeen.add(edge.source);
      }
    }

    // Transitive impact: BFS from direct impact
    const transitivelyImpacted: SemanticSymbol[] = [];
    const transitiveSeen = new Set<string>([symbolId, ...directlyImpacted.map((s) => s.id)]);
    const queue = [...directlyImpacted];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const refs = this.indexes.reference.referencesTo(current.id);
      for (const edge of refs) {
        if (transitiveSeen.has(edge.source)) continue;
        const sym = this.indexes.symbol.byId(edge.source);
        if (sym) {
          transitivelyImpacted.push(sym);
          transitiveSeen.add(edge.source);
          queue.push(sym);
        }
      }
    }

    // Files affected
    const filesAffected = new Set<string>([root.file]);
    for (const s of directlyImpacted) filesAffected.add(s.file);
    for (const s of transitivelyImpacted) filesAffected.add(s.file);

    // Risk level based on impact count
    const totalImpact = directlyImpacted.length + transitivelyImpacted.length;
    let riskLevel: ImpactReport["riskLevel"] = "low";
    if (totalImpact >= 20) riskLevel = "critical";
    else if (totalImpact >= 10) riskLevel = "high";
    else if (totalImpact >= 3) riskLevel = "medium";

    return ok({
      root,
      directlyImpacted,
      transitivelyImpacted,
      filesAffected: [...filesAffected],
      riskLevel,
    });
  }

  // ─── Code Queries ───

  searchCode(query: string, options?: SearchOptions): Result<SemanticFile[]> {
    const {
      caseSensitive = false,
      limit = 50,
      language,
      filePattern,
      regex = false,
    } = options || {};

    const results: SemanticFile[] = [];
    const searchTerm = caseSensitive ? query : query.toLowerCase();

    // Compile regex if requested
    let searchRegex: RegExp | null = null;
    if (regex) {
      try {
        searchRegex = new RegExp(query, caseSensitive ? "" : "i");
      } catch {
        return err("TOOL_INVALID_PARAMS", `Invalid regex: ${query}`);
      }
    }

    // Compile file pattern glob (simple: convert * to .*)
    let fileRegex: RegExp | null = null;
    if (filePattern) {
      const globPattern = filePattern
        .replace(/\./g, "\\.")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");
      fileRegex = new RegExp(`^${globPattern}$`);
    }

    for (const file of this.spm.files) {
      // Filter by language
      if (language && file.language !== language) continue;
      // Filter by file pattern
      if (fileRegex && !fileRegex.test(file.path)) continue;

      // Search in file content
      const content = file.content || "";
      const searchText = caseSensitive ? content : content.toLowerCase();

      const match = searchRegex
        ? searchRegex.test(content)
        : searchText.includes(searchTerm);

      if (match) {
        results.push(file);
        if (results.length >= limit) break;
      }
    }

    return ok(results);
  }

  findFile(path: string): Result<SemanticFile | null> {
    const file = this.spm.files.find((f) => f.path === path);
    return ok(file || null);
  }

  findDeadCode(): Result<SemanticSymbol[]> {
    // A symbol is "dead" if:
    // 1. It's exported but has no incoming references (nobody imports/calls it)
    // 2. It's not an entry point (not named "main", "index", "page", "layout", etc.)
    const entryPointNames = new Set([
      "main", "index", "Page", "Layout", "App",
      "handler", "GET", "POST", "PUT", "DELETE", "PATCH",
    ]);

    const deadSymbols: SemanticSymbol[] = [];

    for (const sym of this.spm.symbols) {
      // Skip imports (they're not dead code indicators)
      if (sym.kind === "import") continue;
      // Skip entry points
      if (entryPointNames.has(sym.name)) continue;

      // Check if anyone references this symbol
      const refs = this.indexes.reference.referencesTo(sym.id);
      if (refs.length === 0) {
        deadSymbols.push(sym);
      }
    }

    return ok(deadSymbols);
  }

  findDuplicates(): Result<DuplicateGroup[]> {
    // Look for duplicate insights from AI deep analysis
    const dupInsight = this.spm.insights.find((i) => i.type === "duplicates");
    if (!dupInsight || !Array.isArray(dupInsight.data)) {
      return ok([]);
    }

    const groups: DuplicateGroup[] = (dupInsight.data as any[]).map((d, i) => ({
      id: `dup-${i}`,
      files: d.files || [],
      lines: d.lines || 0,
      estimatedLinesSaved: d.estimatedLinesSaved || 0,
      pattern: d.pattern || d.title || "Unknown pattern",
    }));

    return ok(groups);
  }

  // ─── Issue Queries ───

  findIssues(filter: IssueFilter): Result<SemanticIssue[]> {
    let issues: SemanticIssue[] = [...this.spm.issues];

    if (filter.category) {
      issues = issues.filter((i) => i.category === filter.category);
    }
    if (filter.severity) {
      issues = issues.filter((i) => i.severity === filter.severity);
    }
    if (filter.file) {
      issues = issues.filter((i) => i.file === filter.file);
    }
    if (filter.symbolId) {
      // Find issues in the same file as the symbol
      const sym = this.indexes.symbol.byId(filter.symbolId);
      if (sym) {
        issues = issues.filter((i) => i.file === sym.file);
      } else {
        issues = [];
      }
    }

    // Sort by severity (critical first)
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    issues.sort((a, b) =>
      (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9),
    );

    return ok(issues);
  }

  findIssuesByFile(file: string): Result<SemanticIssue[]> {
    return ok(this.indexes.issue.byFile(file));
  }

  findIssuesBySymbol(symbolId: string): Result<SemanticIssue[]> {
    return ok(this.indexes.issue.bySymbol(symbolId));
  }

  // ─── Architecture Queries ───

  getArchitecture(): Result<SemanticArchitecture> {
    return ok(this.spm.architecture);
  }

  getMetrics(): Result<SemanticMetrics> {
    return ok(this.spm.metrics);
  }

  findCircularDependencies(): Result<string[][]> {
    return ok(this.indexes.path.cyclicDependencies());
  }

  // ─── Diagram Queries ───
  // Note: Full diagram generation is deferred to Phase 4 (DiagramService).
  // This method returns raw graph data that can be rendered by the DiagramService.

  getDiagram(type: string, options?: DiagramOptions): Result<unknown> {
    // Return raw graph data for the requested diagram type.
    // The actual rendering (SVG, Mermaid, etc.) is done by DiagramService in Phase 4.
    const focus = options?.focus;

    if (type === "dependency" || type === "architecture") {
      // Return all files + depends_on edges
      const nodes = this.spm.files.map((f) => ({
        id: f.path,
        label: f.path.split("/").pop() || f.path,
        type: f.language,
      }));
      const edges = this.spm.edges
        .filter((e) => e.type === "depends_on" || e.type === "imports")
        .map((e) => ({ source: e.source, target: e.target, type: e.type }));

      // Filter by focus if provided
      if (focus) {
        const relatedFiles = new Set<string>([focus]);
        // Add files that focus imports or is imported by
        const impEdges = this.indexes.import.importsByFile(focus);
        impEdges.forEach((e) => relatedFiles.add(e.target));
        const byEdges = this.indexes.import.importedByFile(focus);
        byEdges.forEach((e) => relatedFiles.add(e.file || e.source));

        return ok({
          nodes: nodes.filter((n) => relatedFiles.has(n.id)),
          edges: edges.filter((e) =>
            relatedFiles.has(e.source) && relatedFiles.has(e.target),
          ),
          type,
          options,
        });
      }

      return ok({ nodes, edges, type, options });
    }

    // For other diagram types, return SPM insights if available
    const insight = this.spm.insights.find((i) => i.type === type);
    if (insight) {
      return ok({ data: insight.data, type, options });
    }

    return ok({ nodes: [], edges: [], type, options });
  }
}

// ═══════════════════════════════════════════════════════════════
// Factory
// ═══════════════════════════════════════════════════════════════

/**
 * Create a SemanticQueryService from an SPM + IndexSystem.
 * This is the standard factory — all consumers should use this.
 */
export function createQueryService(
  spm: SemanticProjectModel,
  indexes: IndexSystem,
): SemanticQueryService {
  return new SemanticQueryServiceImpl(spm, indexes);
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function err(code: string, message: string, details?: unknown): { ok: false; error: AgentError } {
  return {
    ok: false,
    error: { code, message, details, recoverable: false },
  };
}
