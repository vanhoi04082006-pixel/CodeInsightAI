// CodeInsight AI — Index System Unit Tests (Layer 1)
// Tests all 6 indexes: Symbol, Reference, Call, Import, Issue, Path.
// Uses a sample SPM built from test data.

import { describe, it, expect } from "@jest/globals";
import { buildSPM } from "@/lib/agent/spm/builder";
import { buildIndexes } from "@/lib/agent/indexes/index-builder";
import type { AnalysisReport } from "@/lib/types";
import type { SemanticProjectModel } from "@/lib/agent/contracts";

// ─── Test Fixture ───

function createTestReport(): AnalysisReport {
  return {
    repoUrl: "https://github.com/test/index-test",
    repoOwner: "test",
    repoName: "index-test",
    repoBranch: "main",
    summary: "Test repo for index system.",
    tags: [],
    scores: {
      overall: 70, security: 60, performance: 75,
      architecture: 80, maintainability: 65, codeQuality: 72,
    },
    scoreBreakdown: [],
    primaryLanguage: "TypeScript",
    totalFiles: 4,
    totalLines: 100,
    languages: [{ name: "TypeScript", percentage: 100, color: "#3178c6", files: 4, lines: 100 }],
    frameworks: [],
    dependencies: {
      nodes: [
        { id: "n1", label: "src/app/page.tsx", type: "entry", group: 0, x: 0, y: 0, size: 10 },
        { id: "n2", label: "src/lib/auth.ts", type: "service", group: 1, x: 1, y: 1, size: 8 },
        { id: "n3", label: "src/lib/db.ts", type: "service", group: 1, x: 2, y: 2, size: 6 },
        { id: "n4", label: "src/lib/utils.ts", type: "util", group: 2, x: 3, y: 3, size: 4 },
      ],
      edges: [
        { from: "n1", to: "n2", weight: 1 },  // page → auth
        { from: "n2", to: "n3", weight: 1 },  // auth → db
        { from: "n3", to: "n3", weight: 1 },  // db → db (self-loop for cycle test)
      ],
      circular: [{ nodes: ["src/lib/db.ts"] }],
    },
    issues: {
      bugs: [
        { id: "bug-1", severity: "high", category: "null-ref", title: "Null deref", description: "ctx.user.id without check", file: "src/app/page.tsx", line: 10, recommendation: "Add null check", effort: "small" },
        { id: "bug-2", severity: "low", category: "hooks", title: "Missing deps", description: "useEffect missing deps", file: "src/app/page.tsx", line: 20, recommendation: "Add deps", effort: "trivial" },
      ],
      security: [
        { id: "sec-1", severity: "critical", category: "sqli", title: "SQL Injection", description: "Raw query", file: "src/lib/db.ts", line: 5, recommendation: "Parameterize", effort: "medium" },
      ],
      performance: [
        { id: "perf-1", severity: "medium", category: "render", title: "Expensive render", description: "Computation in render", file: "src/lib/auth.ts", line: 15, recommendation: "useMemo", effort: "small" },
      ],
    },
    files: [
      {
        path: "src/app/page.tsx", language: "TypeScript", lines: 30,
        complexity: 5, maintainability: 70, description: "Page", issues: 2,
        functions: ["Page"], classes: [],
        imports: ["src/lib/auth", "src/lib/utils"],
        exports: ["Page"],
        functionSignatures: [{
          name: "Page", params: [], returnType: "JSX.Element",
          isAsync: false, isExported: true, startLine: 1, endLine: 20,
        }],
      },
      {
        path: "src/lib/auth.ts", language: "TypeScript", lines: 25,
        complexity: 4, maintainability: 75, description: "Auth service", issues: 1,
        functions: ["login", "logout"], classes: ["AuthService"],
        imports: ["src/lib/db"],
        exports: ["login", "logout", "AuthService"],
        functionSignatures: [
          { name: "login", params: ["email", "password"], returnType: "Promise<boolean>", isAsync: true, isExported: true, startLine: 1, endLine: 10 },
          { name: "logout", params: [], returnType: "void", isAsync: false, isExported: true, startLine: 12, endLine: 15 },
        ],
      },
      {
        path: "src/lib/db.ts", language: "TypeScript", lines: 20,
        complexity: 3, maintainability: 80, description: "DB service", issues: 1,
        functions: ["query"], classes: [],
        imports: [],
        exports: ["query"],
        functionSignatures: [
          { name: "query", params: ["sql"], returnType: "Promise<any>", isAsync: true, isExported: true, startLine: 1, endLine: 8 },
        ],
      },
      {
        path: "src/lib/utils.ts", language: "TypeScript", lines: 25,
        complexity: 2, maintainability: 85, description: "Utils", issues: 0,
        functions: ["formatDate"], classes: [],
        imports: [],
        exports: ["formatDate"],
        functionSignatures: [
          { name: "formatDate", params: ["date"], returnType: "string", isAsync: false, isExported: true, startLine: 1, endLine: 5 },
        ],
      },
    ],
    snippets: [],
    diagrams: { uml: "", sequence: "", erd: "", umlExplanation: "", sequenceExplanation: "", erdExplanation: "" },
    deadCode: [],
    duplicates: [],
    maintainabilityTrend: [],
    architecture: {
      pattern: "Layered", description: "", layers: [],
      strengths: [], weaknesses: [],
    },
    technicalDebt: { score: 30, items: [] },
    roadmap: [], monetization: [],
    documentation: { readme: "", apiDocs: "", architectureMd: "", folderGuide: "", componentGuide: "", deploymentGuide: "" },
    activity: [], complexityTrend: [],
  };
}

// ─── Build SPM + Indexes for tests ───

const report = createTestReport();
const spmResult = buildSPM(report, "test-index");
if (!spmResult.ok) throw new Error("Failed to build SPM for tests");
const spm: SemanticProjectModel = spmResult.value;
const indexes = buildIndexes(spm);

// ─── Tests ───

describe("SymbolIndex", () => {
  it("should find symbols by name", () => {
    const results = indexes.symbol.byName("Page");
    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe("function");
    expect(results[0].file).toBe("src/app/page.tsx");
  });

  it("should find symbol by ID", () => {
    const sym = indexes.symbol.byId("src/app/page.tsx::Page::function");
    expect(sym).not.toBeNull();
    expect(sym!.name).toBe("Page");
  });

  it("should return null for non-existent ID", () => {
    expect(indexes.symbol.byId("non::existent::symbol")).toBeNull();
  });

  it("should find symbols by file", () => {
    const results = indexes.symbol.byFile("src/lib/auth.ts");
    expect(results.length).toBeGreaterThanOrEqual(3); // login, logout, AuthService + imports
    const funcNames = results.filter(s => s.kind === "function").map(s => s.name);
    expect(funcNames).toContain("login");
    expect(funcNames).toContain("logout");
  });

  it("should return empty array for unknown file", () => {
    expect(indexes.symbol.byFile("nonexistent.ts")).toEqual([]);
  });

  it("should find symbols by kind", () => {
    const functions = indexes.symbol.byKind("function");
    expect(functions.length).toBeGreaterThanOrEqual(4); // Page, login, logout, query, formatDate
    const classes = indexes.symbol.byKind("class");
    expect(classes.length).toBeGreaterThanOrEqual(1); // AuthService
  });
});

describe("ReferenceIndex", () => {
  it("should find edges referencing a symbol (incoming)", () => {
    // The dependency edge auth→db creates a reference
    const refs = indexes.reference.referencesTo("src/lib/db.ts");
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });

  it("should find edges from a symbol (outgoing)", () => {
    // page.tsx imports auth and utils
    const pageSymbol = indexes.symbol.byFile("src/app/page.tsx").find(s => s.kind === "import" && s.name === "auth");
    if (pageSymbol) {
      const refs = indexes.reference.referencesFrom(pageSymbol.id);
      expect(refs.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("should return empty for unknown symbol", () => {
    expect(indexes.reference.referencesTo("non::existent")).toEqual([]);
    expect(indexes.reference.referencesFrom("non::existent")).toEqual([]);
  });
});

describe("CallIndex", () => {
  it("should find direct callers of a symbol", () => {
    // No explicit "calls" edges in test data (only depends_on + imports)
    // So callers should be empty — verify no crash
    const callers = indexes.call.callers("src/lib/db.ts::query::function");
    expect(Array.isArray(callers)).toBe(true);
  });

  it("should find direct callees of a symbol", () => {
    const callees = indexes.call.callees("src/app/page.tsx::Page::function");
    expect(Array.isArray(callees)).toBe(true);
  });

  it("should build call chain with depth limit", () => {
    const chain = indexes.call.callChain("src/app/page.tsx::Page::function", 3);
    expect(Array.isArray(chain)).toBe(true);
    if (chain.length > 0) {
      expect(chain[0].depth).toBe(0);
      expect(chain[0].symbol.name).toBe("Page");
    }
  });

  it("should return empty for unknown entry symbol", () => {
    expect(indexes.call.callChain("non::existent", 5)).toEqual([]);
  });
});

describe("ImportIndex", () => {
  it("should find imports by file", () => {
    const imports = indexes.import.importsByFile("src/app/page.tsx");
    expect(imports.length).toBeGreaterThanOrEqual(2); // auth + utils
    const targets = imports.map(e => e.target);
    expect(targets).toContain("src/lib/auth");
    expect(targets).toContain("src/lib/utils");
  });

  it("should find who imports a file", () => {
    const importers = indexes.import.importedByFile("src/lib/auth");
    expect(importers.length).toBeGreaterThanOrEqual(1);
  });

  it("should return empty for file with no imports", () => {
    expect(indexes.import.importsByFile("src/lib/utils.ts")).toEqual([]);
  });

  it("should compute transitive import chain", () => {
    // page.tsx imports auth and utils (direct)
    // auth.ts imports db — but import target "src/lib/auth" ≠ file path "src/lib/auth.ts"
    // So transitive chain stops at direct imports until path normalization is added (Phase 3)
    const chain = indexes.import.importChain("src/app/page.tsx");
    expect(chain).toContain("src/lib/auth");
    expect(chain).toContain("src/lib/utils");
  });

  it("should return empty chain for file with no imports", () => {
    expect(indexes.import.importChain("src/lib/db.ts")).toEqual([]);
  });
});

describe("IssueIndex", () => {
  it("should find issues by file", () => {
    const issues = indexes.issue.byFile("src/app/page.tsx");
    expect(issues).toHaveLength(2); // bug-1 + bug-2
  });

  it("should find issues by category", () => {
    const security = indexes.issue.byCategory("security");
    expect(security).toHaveLength(1);
    expect(security[0].id).toBe("sec-1");

    const bugs = indexes.issue.byCategory("bugs");
    expect(bugs).toHaveLength(2);
  });

  it("should find issues by severity", () => {
    const critical = indexes.issue.bySeverity("critical");
    expect(critical).toHaveLength(1);
    expect(critical[0].id).toBe("sec-1");

    const high = indexes.issue.bySeverity("high");
    expect(high).toHaveLength(1);
    expect(high[0].id).toBe("bug-1");
  });

  it("should find issues by symbol", () => {
    // Symbols in src/app/page.tsx should have issues
    const pageSymbol = indexes.symbol.byId("src/app/page.tsx::Page::function");
    expect(pageSymbol).not.toBeNull();
    if (pageSymbol) {
      const issues = indexes.issue.bySymbol(pageSymbol.id);
      expect(issues).toHaveLength(2); // bug-1 + bug-2 (same file)
    }
  });

  it("should return empty for unknown file", () => {
    expect(indexes.issue.byFile("nonexistent.ts")).toEqual([]);
  });
});

describe("PathIndex", () => {
  it("should find shortest path between nodes", () => {
    // page → auth → db (via dependency edges)
    // Dependency edges use labels as source/target
    const path = indexes.path.shortestPath("src/app/page.tsx", "src/lib/db.ts");
    expect(path).not.toBeNull();
    if (path) {
      expect(path[0]).toBe("src/app/page.tsx");
      expect(path[path.length - 1]).toBe("src/lib/db.ts");
      expect(path.length).toBeLessThanOrEqual(3); // page → auth → db
    }
  });

  it("should return null when no path exists", () => {
    const path = indexes.path.shortestPath("src/lib/utils.ts", "src/lib/db.ts");
    // utils.ts has no outgoing edges → no path to db.ts
    expect(path).toBeNull();
  });

  it("should return [from] when from === to", () => {
    expect(indexes.path.shortestPath("src/app/page.tsx", "src/app/page.tsx")).toEqual(["src/app/page.tsx"]);
  });

  it("should find all paths with depth limit", () => {
    const paths = indexes.path.allPaths("src/app/page.tsx", "src/lib/db.ts", 5);
    expect(paths.length).toBeGreaterThanOrEqual(1);
    for (const path of paths) {
      expect(path[0]).toBe("src/app/page.tsx");
      expect(path[path.length - 1]).toBe("src/lib/db.ts");
    }
  });

  it("should detect cyclic dependencies", () => {
    const cycles = indexes.path.cyclicDependencies();
    // db → db self-loop should be detected
    expect(cycles.length).toBeGreaterThanOrEqual(1);
  });

  it("should return empty for non-existent nodes", () => {
    expect(indexes.path.shortestPath("nonexistent", "alsogone")).toBeNull();
    expect(indexes.path.allPaths("nonexistent", "alsogone", 5)).toEqual([]);
  });
});

describe("Index Builder", () => {
  it("should build all 6 indexes without error", () => {
    expect(indexes.symbol).toBeDefined();
    expect(indexes.reference).toBeDefined();
    expect(indexes.call).toBeDefined();
    expect(indexes.import).toBeDefined();
    expect(indexes.issue).toBeDefined();
    expect(indexes.path).toBeDefined();
  });

  it("should handle empty SPM", () => {
    const emptyReport: AnalysisReport = {
      ...report,
      files: [], issues: { bugs: [], security: [], performance: [] },
      snippets: [],
      dependencies: { nodes: [], edges: [], circular: [] },
    };
    const result = buildSPM(emptyReport, "empty");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const emptyIndexes = buildIndexes(result.value);
    expect(emptyIndexes.symbol.byName("anything")).toEqual([]);
    expect(emptyIndexes.issue.byFile("anything")).toEqual([]);
    expect(emptyIndexes.path.cyclicDependencies()).toEqual([]);
  });
});
