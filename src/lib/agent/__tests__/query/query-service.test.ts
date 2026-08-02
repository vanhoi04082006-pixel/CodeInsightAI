// CodeInsight AI — Query Service Unit Tests (Layer 2)
// Tests all 18 query methods on the SemanticQueryService.

import { describe, it, expect } from "@jest/globals";
import { buildSPM } from "@/lib/agent/spm/builder";
import { buildIndexes } from "@/lib/agent/indexes/index-builder";
import { createQueryService } from "@/lib/agent/query/query-service";
import type { AnalysisReport } from "@/lib/types";

// ─── Test Fixture ───

function createTestReport(): AnalysisReport {
  return {
    repoUrl: "https://github.com/test/query-test",
    repoOwner: "test",
    repoName: "query-test",
    repoBranch: "main",
    summary: "Test repo for query service.",
    tags: ["test"],
    scores: { overall: 72, security: 65, performance: 78, architecture: 82, maintainability: 68, codeQuality: 70 },
    scoreBreakdown: [],
    primaryLanguage: "TypeScript",
    totalFiles: 3,
    totalLines: 80,
    languages: [{ name: "TypeScript", percentage: 100, color: "#3178c6", files: 3, lines: 80 }],
    frameworks: [],
    dependencies: {
      nodes: [
        { id: "n1", label: "src/app/page.tsx", type: "entry", group: 0, x: 0, y: 0, size: 10 },
        { id: "n2", label: "src/lib/api.ts", type: "service", group: 1, x: 1, y: 1, size: 8 },
      ],
      edges: [{ from: "n1", to: "n2", weight: 1 }],
      circular: [],
    },
    issues: {
      bugs: [
        { id: "bug-1", severity: "high", category: "null-ref", title: "Null deref", description: "Missing null check", file: "src/app/page.tsx", line: 10, recommendation: "Add null check", effort: "small" },
        { id: "bug-2", severity: "low", category: "hooks", title: "Missing deps", description: "useEffect missing deps", file: "src/app/page.tsx", line: 20, recommendation: "Add deps array", effort: "trivial" },
      ],
      security: [
        { id: "sec-1", severity: "critical", category: "sqli", title: "SQL Injection", description: "Raw SQL query", file: "src/lib/api.ts", line: 5, recommendation: "Use parameterized queries", effort: "medium" },
      ],
      performance: [],
    },
    files: [
      {
        path: "src/app/page.tsx", language: "TypeScript", lines: 30,
        complexity: 5, maintainability: 70, description: "Main page", issues: 2,
        functions: ["Page"], classes: [],
        imports: ["src/lib/api"],
        exports: ["Page"],
        functionSignatures: [{
          name: "Page", params: [], returnType: "JSX.Element",
          isAsync: false, isExported: true, startLine: 1, endLine: 20,
        }],
      },
      {
        path: "src/lib/api.ts", language: "TypeScript", lines: 25,
        complexity: 4, maintainability: 75, description: "API service", issues: 1,
        functions: ["fetchData", "postData"], classes: [],
        imports: [],
        exports: ["fetchData", "postData"],
        functionSignatures: [
          { name: "fetchData", params: ["url"], returnType: "Promise<any>", isAsync: true, isExported: true, startLine: 1, endLine: 10 },
          { name: "postData", params: ["url", "body"], returnType: "Promise<any>", isAsync: true, isExported: true, startLine: 12, endLine: 20 },
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
    snippets: [
      {
        file: "src/app/page.tsx", language: "TypeScript",
        code: "export function Page() { return <div>Hello</div> }",
        title: "Main page", explanation: "Entry point",
        rawContent: "import { fetchData } from '@/lib/api';\n\nexport function Page() {\n  const data = fetchData();\n  return <div>{data}</div>;\n}\n",
      },
    ],
    diagrams: { uml: "", sequence: "", erd: "", umlExplanation: "", sequenceExplanation: "", erdExplanation: "" },
    deadCode: [{ path: "src/lib/utils.ts", lines: 25, reason: "No imports" }],
    duplicates: [{ group: 1, files: ["src/a.ts", "src/b.ts"], lines: 15 }],
    maintainabilityTrend: [],
    architecture: {
      pattern: "Layered", description: "Standard layered architecture",
      layers: [{ name: "UI", responsibility: "Components", files: 1 }, { name: "Service", responsibility: "API calls", files: 1 }],
      strengths: ["Clear separation"], weaknesses: ["Tight coupling"],
    },
    technicalDebt: { score: 30, items: [] },
    roadmap: [], monetization: [],
    documentation: { readme: "", apiDocs: "", architectureMd: "", folderGuide: "", componentGuide: "", deploymentGuide: "" },
    activity: [], complexityTrend: [],
  };
}

// ─── Build SPM + Indexes + Query Service ───

const report = createTestReport();
const spmResult = buildSPM(report, "query-test");
if (!spmResult.ok) throw new Error("Failed to build SPM");
const spm = spmResult.value;
const indexes = buildIndexes(spm);
const query = createQueryService(spm, indexes);

// ─── Tests ───

describe("SemanticQueryService", () => {

  // ─── Symbol Queries ───

  describe("findSymbol", () => {
    it("should find symbols by name", () => {
      const result = query.findSymbol("Page");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].name).toBe("Page");
    });

    it("should return empty for non-existent name", () => {
      const result = query.findSymbol("nonExistentFunction");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(0);
    });
  });

  describe("findDefinition", () => {
    it("should find symbol by ID", () => {
      const result = query.findDefinition("src/app/page.tsx::Page::function");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).not.toBeNull();
      expect(result.value!.name).toBe("Page");
    });

    it("should return null for non-existent ID", () => {
      const result = query.findDefinition("non::existent");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBeNull();
    });
  });

  describe("findReferences", () => {
    it("should find references to a symbol", () => {
      const result = query.findReferences("src/lib/api.ts");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.length).toBeGreaterThanOrEqual(1);
    });

    it("should return empty for unknown symbol", () => {
      const result = query.findReferences("non::existent");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);
    });
  });

  describe("findCallers", () => {
    it("should find callers of a symbol", () => {
      const result = query.findCallers("src/lib/api.ts::fetchData::function");
      expect(result.ok).toBe(true);
      expect(Array.isArray(result.ok ? result.value : [])).toBe(true);
    });
  });

  describe("findCallees", () => {
    it("should find callees of a symbol", () => {
      const result = query.findCallees("src/app/page.tsx::Page::function");
      expect(result.ok).toBe(true);
      expect(Array.isArray(result.ok ? result.value : [])).toBe(true);
    });
  });

  describe("findCallChain", () => {
    it("should build call chain from entry point", () => {
      const result = query.findCallChain("src/app/page.tsx::Page::function", 3);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.symbol.name).toBe("Page");
      expect(result.value.depth).toBe(0);
    });

    it("should return error for unknown entry", () => {
      const result = query.findCallChain("non::existent", 5);
      expect(result.ok).toBe(false);
    });
  });

  // ─── Impact Analysis ───

  describe("findImpact", () => {
    it("should find impact of a symbol", () => {
      const result = query.findImpact("src/lib/api.ts::fetchData::function");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.root.name).toBe("fetchData");
      expect(result.value.filesAffected.length).toBeGreaterThanOrEqual(1);
      expect(result.value.riskLevel).toBeDefined();
    });

    it("should return error for unknown symbol", () => {
      const result = query.findImpact("non::existent");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SYMBOL_NOT_FOUND");
      }
    });
  });

  // ─── Code Queries ───

  describe("searchCode", () => {
    it("should search in file contents (case insensitive)", () => {
      const result = query.searchCode("fetchdata");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.length).toBeGreaterThanOrEqual(1);
    });

    it("should search in file contents (case sensitive)", () => {
      const result = query.searchCode("fetchData", { caseSensitive: true });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.length).toBeGreaterThanOrEqual(1);
    });

    it("should filter by language", () => {
      const result = query.searchCode("function", { language: "TypeScript" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      for (const f of result.value) {
        expect(f.language).toBe("TypeScript");
      }
    });

    it("should respect limit", () => {
      const result = query.searchCode("function", { limit: 1 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.length).toBeLessThanOrEqual(1);
    });

    it("should support regex search", () => {
      const result = query.searchCode("fetch\\w+", { regex: true });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.length).toBeGreaterThanOrEqual(1);
    });

    it("should return error for invalid regex", () => {
      const result = query.searchCode("[invalid", { regex: true });
      expect(result.ok).toBe(false);
    });

    it("should return empty for no matches", () => {
      const result = query.searchCode("nonExistentPattern12345");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);
    });
  });

  describe("findFile", () => {
    it("should find file by path", () => {
      const result = query.findFile("src/app/page.tsx");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).not.toBeNull();
      expect(result.value!.path).toBe("src/app/page.tsx");
    });

    it("should return null for non-existent file", () => {
      const result = query.findFile("nonexistent.ts");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBeNull();
    });
  });

  describe("findDeadCode", () => {
    it("should find dead code symbols", () => {
      const result = query.findDeadCode();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // formatDate in utils.ts has no incoming references (nobody imports utils.ts)
      const dead = result.value.find((s) => s.name === "formatDate");
      expect(dead).toBeDefined();
    });
  });

  describe("findDuplicates", () => {
    it("should find duplicate groups from insights", () => {
      const reportWithDups = {
        ...report,
        deepAnalysis: {
          duplicateAnalysis: [{ files: ["a.ts", "b.ts"], lines: 10, estimatedLinesSaved: 8, pattern: "Similar function" }],
        },
      } as any;
      const spmResult2 = buildSPM(reportWithDups, "dup-test");
      if (!spmResult2.ok) throw new Error("SPM build failed");
      const indexes2 = buildIndexes(spmResult2.value);
      const query2 = createQueryService(spmResult2.value, indexes2);

      const result = query2.findDuplicates();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].files).toEqual(["a.ts", "b.ts"]);
      expect(result.value[0].estimatedLinesSaved).toBe(8);
    });

    it("should return empty when no duplicates", () => {
      const result = query.findDuplicates();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);
    });
  });

  // ─── Issue Queries ───

  describe("findIssues", () => {
    it("should find all issues sorted by severity", () => {
      const result = query.findIssues({});
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(3);
      // Critical should be first
      expect(result.value[0].severity).toBe("critical");
    });

    it("should filter by category", () => {
      const result = query.findIssues({ category: "security" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].id).toBe("sec-1");
    });

    it("should filter by severity", () => {
      const result = query.findIssues({ severity: "low" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].id).toBe("bug-2");
    });

    it("should filter by file", () => {
      const result = query.findIssues({ file: "src/app/page.tsx" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
    });

    it("should filter by symbolId (same file)", () => {
      const result = query.findIssues({ symbolId: "src/app/page.tsx::Page::function" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2); // both bugs in page.tsx
    });

    it("should return empty for non-existent symbolId", () => {
      const result = query.findIssues({ symbolId: "non::existent" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);
    });
  });

  describe("findIssuesByFile", () => {
    it("should find issues by file", () => {
      const result = query.findIssuesByFile("src/app/page.tsx");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
    });

    it("should return empty for unknown file", () => {
      const result = query.findIssuesByFile("nonexistent.ts");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);
    });
  });

  describe("findIssuesBySymbol", () => {
    it("should find issues by symbol (same file)", () => {
      const result = query.findIssuesBySymbol("src/app/page.tsx::Page::function");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
    });
  });

  // ─── Architecture Queries ───

  describe("getArchitecture", () => {
    it("should return architecture data", () => {
      const result = query.getArchitecture();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.pattern).toBe("Layered");
      expect(result.value.strengths).toContain("Clear separation");
      expect(result.value.weaknesses).toContain("Tight coupling");
    });
  });

  describe("getMetrics", () => {
    it("should return metrics data", () => {
      const result = query.getMetrics();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.totalFiles).toBe(3);
      expect(result.value.totalLines).toBe(80);
      expect(result.value.totalSymbols).toBeGreaterThan(0);
    });
  });

  describe("findCircularDependencies", () => {
    it("should detect circular dependencies", () => {
      const result = query.findCircularDependencies();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Array.isArray(result.value)).toBe(true);
    });
  });

  // ─── Diagram Queries ───

  describe("getDiagram", () => {
    it("should return dependency graph data", () => {
      const result = query.getDiagram("dependency");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.value as any;
      expect(data.nodes).toBeDefined();
      expect(data.edges).toBeDefined();
      expect(data.type).toBe("dependency");
    });

    it("should return architecture diagram data", () => {
      const result = query.getDiagram("architecture");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.value as any;
      expect(data.nodes).toBeDefined();
    });

    it("should filter by focus", () => {
      const result = query.getDiagram("dependency", { focus: "src/app/page.tsx" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.value as any;
      // Should include page.tsx + files it imports
      expect(data.nodes.some((n: any) => n.id === "src/app/page.tsx")).toBe(true);
    });

    it("should return empty for unknown diagram type", () => {
      const result = query.getDiagram("unknown-type");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.value as any;
      expect(data.nodes).toEqual([]);
    });
  });
});
