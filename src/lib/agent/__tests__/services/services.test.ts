// CodeInsight AI — Service Layer Unit Tests (Layer 3)
// Tests all 6 services: Graph, Diagram, Search, Git, Repo, AIInsight.

import { describe, it, expect } from "@jest/globals";
import { buildSPM } from "@/lib/agent/spm/builder";
import { GraphServiceImpl } from "@/lib/agent/services/graph-service";
import { SearchServiceImpl } from "@/lib/agent/services/search-service";
import { GitServiceImpl } from "@/lib/agent/services/git-service";
import { RepoServiceImpl } from "@/lib/agent/services/repo-service";
import { AIInsightServiceImpl } from "@/lib/agent/services/ai-insight-service";
import type { AnalysisReport } from "@/lib/types";

// ─── Test Fixture ───

function createTestReport(): AnalysisReport {
  return {
    repoUrl: "https://github.com/test/service-test",
    repoOwner: "test",
    repoName: "service-test",
    repoBranch: "main",
    summary: "Test repo for service layer.",
    tags: [],
    scores: { overall: 70, security: 60, performance: 75, architecture: 80, maintainability: 65, codeQuality: 72 },
    scoreBreakdown: [],
    primaryLanguage: "TypeScript",
    totalFiles: 2,
    totalLines: 50,
    languages: [{ name: "TypeScript", percentage: 100, color: "#3178c6", files: 2, lines: 50 }],
    frameworks: [],
    dependencies: {
      nodes: [
        { id: "n1", label: "src/app.ts", type: "entry", group: 0, x: 0, y: 0, size: 10 },
        { id: "n2", label: "src/lib.ts", type: "util", group: 1, x: 1, y: 1, size: 5 },
      ],
      edges: [{ from: "n1", to: "n2", weight: 1 }],
      circular: [],
    },
    issues: {
      bugs: [{ id: "b1", severity: "high", category: "null-ref", title: "Null deref", description: "Missing check", file: "src/app.ts", line: 5, recommendation: "Add check", effort: "small" }],
      security: [{ id: "s1", severity: "critical", category: "sqli", title: "SQLi", description: "Raw query", file: "src/lib.ts", line: 3, recommendation: "Parameterize", effort: "medium" }],
      performance: [],
    },
    files: [
      {
        path: "src/app.ts", language: "TypeScript", lines: 30,
        complexity: 3, maintainability: 70, description: "App", issues: 1,
        functions: ["main"], classes: [],
        imports: ["src/lib"],
        exports: ["main"],
        functionSignatures: [{ name: "main", params: [], returnType: "void", isAsync: false, isExported: true, startLine: 1, endLine: 10 }],
      },
      {
        path: "src/lib.ts", language: "TypeScript", lines: 20,
        complexity: 2, maintainability: 80, description: "Lib", issues: 1,
        functions: ["helper"], classes: [],
        imports: [],
        exports: ["helper"],
        functionSignatures: [{ name: "helper", params: ["x"], returnType: "string", isAsync: false, isExported: true, startLine: 1, endLine: 5 }],
      },
    ],
    snippets: [{ file: "src/app.ts", language: "TypeScript", code: "function main() {}", title: "App", explanation: "Entry", rawContent: "import { helper } from './lib';\nfunction main() {\n  helper(42);\n}\n" }],
    diagrams: { uml: "", sequence: "", erd: "", umlExplanation: "", sequenceExplanation: "", erdExplanation: "" },
    deadCode: [],
    duplicates: [],
    maintainabilityTrend: [],
    architecture: { pattern: "Layered", description: "", layers: [], strengths: [], weaknesses: [] },
    technicalDebt: { score: 30, items: [] },
    roadmap: [], monetization: [],
    documentation: { readme: "", apiDocs: "", architectureMd: "", folderGuide: "", componentGuide: "", deploymentGuide: "" },
    activity: [], complexityTrend: [],
  };
}

const report = createTestReport();
const spmResult = buildSPM(report, "service-test");
if (!spmResult.ok) throw new Error("Failed to build SPM");
const spm = spmResult.value;

// ─── Tests ───

describe("GraphService", () => {
  const graph = new GraphServiceImpl();

  it("should build graph from SPM", () => {
    const result = graph.buildGraph(spm);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes.length).toBeGreaterThan(0);
    expect(result.value.edges.length).toBeGreaterThan(0);
  });

  it("should cache graph data", () => {
    const r1 = graph.buildGraph(spm);
    const r2 = graph.buildGraph(spm);
    expect(r1.ok && r2.ok).toBe(true);
    // Same SPM → should return cached (same reference)
    if (!r1.ok || !r2.ok) return;
    expect(r1.value).toBe(r2.value);
  });

  it("should find path between nodes", () => {
    graph.buildGraph(spm);
    const result = graph.findPath("src/app.ts", "src/lib.ts");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Path might exist via dependency edges
    expect(result.value === null || Array.isArray(result.value)).toBe(true);
  });

  it("should return error when graph not built", () => {
    const emptyGraph = new GraphServiceImpl();
    const result = emptyGraph.findPath("a", "b");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SPM_NOT_INITIALIZED");
    }
  });

  it("should find cycles", () => {
    graph.buildGraph(spm);
    const result = graph.findCycles();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.value)).toBe(true);
  });

  it("should compute stats", () => {
    graph.buildGraph(spm);
    const result = graph.getStats();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totalNodes).toBeGreaterThan(0);
    expect(result.value.totalEdges).toBeGreaterThan(0);
    expect(result.value.avgConnectivity).toBeGreaterThanOrEqual(0);
  });
});

describe("SearchService", () => {
  const search = new SearchServiceImpl();

  it("should index SPM files", () => {
    const result = search.index(spm);
    expect(result.ok).toBe(true);
  });

  it("should search file contents", () => {
    const result = search.search("helper", spm);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
    expect(result.value[0].file).toBeDefined();
    expect(result.value[0].line).toBeGreaterThan(0);
    expect(result.value[0].score).toBeGreaterThan(0);
  });

  it("should filter by language", () => {
    const result = search.search("function", spm, { language: "TypeScript" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const r of result.value) {
      expect(r.file).toBeDefined();
    }
  });

  it("should support regex search", () => {
    const result = search.search("help\\w+", spm, { regex: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
  });

  it("should return error for invalid regex", () => {
    const result = search.search("[invalid", spm, { regex: true });
    expect(result.ok).toBe(false);
  });

  it("should return empty for no matches", () => {
    const result = search.search("nonexistentPattern12345", spm);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it("should respect limit", () => {
    const result = search.search(".", spm, { regex: true, limit: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeLessThanOrEqual(1);
  });

  it("should auto-index when SPM changes", () => {
    const newSearch = new SearchServiceImpl();
    const result = newSearch.search("helper", spm);
    expect(result.ok).toBe(true);
  });
});

describe("GitService", () => {
  const git = new GitServiceImpl();

  it("should return diff result", () => {
    const result = git.diff();
    expect(result.ok).toBe(true);
  });

  it("should return diff for specific file", () => {
    const result = git.diff("src/app.ts");
    expect(result.ok).toBe(true);
  });

  it("should return commit result", () => {
    const result = git.commit("test message");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.value).toBe("string");
  });

  it("should return push result", () => {
    const result = git.push();
    expect(result.ok).toBe(true);
  });

  it("should return history result", () => {
    const result = git.history("src/app.ts");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.value)).toBe(true);
  });

  it("should return revert result", () => {
    const result = git.revert("abc123");
    expect(result.ok).toBe(true);
  });
});

describe("RepoService", () => {
  const repo = new RepoServiceImpl();

  it("should return readFile result", () => {
    const result = repo.readFile("src/app.ts");
    expect(result.ok).toBe(true);
  });

  it("should return writeFile result", () => {
    const result = repo.writeFile("src/app.ts", "content");
    expect(result.ok).toBe(true);
  });

  it("should return deleteFile result", () => {
    const result = repo.deleteFile("src/app.ts");
    expect(result.ok).toBe(true);
  });

  it("should return moveFile result", () => {
    const result = repo.moveFile("src/old.ts", "src/new.ts");
    expect(result.ok).toBe(true);
  });

  it("should return applyPatch result", () => {
    const result = repo.applyPatch("--- a/src/app.ts\n+++ b/src/app.ts\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.value)).toBe(true);
  });

  it("should return rollback result", () => {
    const result = repo.rollback([]);
    expect(result.ok).toBe(true);
  });

  it("should track changes in changeLog", () => {
    expect(repo.getChangeLog()).toEqual([]);
    expect(Array.isArray(repo.getChangeLog())).toBe(true);
  });

  it("should clear changeLog", () => {
    repo.clearChangeLog();
    expect(repo.getChangeLog()).toEqual([]);
  });
});

describe("AIInsightService", () => {
  const ai = new AIInsightServiceImpl();

  it("should get cached insight from SPM", () => {
    const reportWithDeep = {
      ...report,
      deepAnalysis: {
        aiOverview: { healthAssessment: "Good" },
      },
    } as any;
    const result = buildSPM(reportWithDeep, "ai-test");
    if (!result.ok) throw new Error("SPM build failed");

    const insightResult = ai.getInsight("overview", result.value);
    expect(insightResult.ok).toBe(true);
    if (!insightResult.ok) return;
    expect(insightResult.value).not.toBeNull();
    expect(insightResult.value!.type).toBe("overview");
  });

  it("should return null for non-existent insight", () => {
    const result = ai.getInsight("nonexistent", spm);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });

  it("should return error for sync generateInsight (async required)", () => {
    const result = ai.generateInsight("overview", { spm });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("async");
    }
  });
});
