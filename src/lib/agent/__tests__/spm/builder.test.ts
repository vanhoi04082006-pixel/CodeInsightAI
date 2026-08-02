// CodeInsight AI — SPM Builder Unit Tests
//
// Tests that buildSPM() correctly maps AnalysisReport → SemanticProjectModel.
// Uses a minimal sample report that exercises all mapping paths.

import { describe, it, expect } from "@jest/globals";
import { buildSPM } from "@/lib/agent/spm/builder";
import { deserializeSPM, serializeSPM } from "@/lib/agent/spm/serializer";
import type { AnalysisReport } from "@/lib/types";

// ─── Test Fixtures ───

function createSampleReport(): AnalysisReport {
  return {
    repoUrl: "https://github.com/test/sample-repo",
    repoOwner: "test",
    repoName: "sample-repo",
    repoBranch: "main",
    summary: "A sample repo for testing SPM builder.",
    tags: ["test", "sample"],
    scores: {
      overall: 75,
      security: 80,
      performance: 70,
      architecture: 85,
      maintainability: 65,
      codeQuality: 72,
    },
    scoreBreakdown: [],
    primaryLanguage: "TypeScript",
    totalFiles: 3,
    totalLines: 150,
    languages: [
      { name: "TypeScript", percentage: 80, color: "#3178c6", files: 2, lines: 120 },
      { name: "JavaScript", percentage: 20, color: "#f7df1e", files: 1, lines: 30 },
    ],
    frameworks: [{ name: "Next.js", version: "16.0.0", category: "framework", confidence: 0.95 }],
    dependencies: {
      nodes: [
        { id: "n1", label: "src/app/page.tsx", type: "entry", group: 0, x: 0, y: 0, size: 10 },
        { id: "n2", label: "src/lib/utils.ts", type: "util", group: 1, x: 1, y: 1, size: 5 },
      ],
      edges: [{ from: "n1", to: "n2", weight: 1 }],
      circular: [],
    },
    issues: {
      bugs: [
        {
          id: "bug-1",
          severity: "medium",
          category: "hooks",
          title: "Missing useEffect dependency",
          description: "useEffect missing deps",
          file: "src/app/page.tsx",
          line: 10,
          recommendation: "Add dependency array",
          effort: "trivial",
        },
      ],
      security: [
        {
          id: "sec-1",
          severity: "critical",
          category: "sqli",
          title: "SQL Injection",
          description: "Raw query with user input",
          file: "src/app/api/route.ts",
          line: 5,
          recommendation: "Use parameterized queries",
          effort: "small",
        },
      ],
      performance: [
        {
          id: "perf-1",
          severity: "low",
          category: "bundle",
          title: "Large import",
          description: "Full lodash import",
          file: "src/lib/utils.ts",
          line: 1,
          recommendation: "Use lodash-es with tree-shaking",
          effort: "trivial",
        },
      ],
    },
    files: [
      {
        path: "src/app/page.tsx",
        language: "TypeScript",
        lines: 50,
        complexity: 5,
        maintainability: 70,
        description: "Main page component",
        issues: 1,
        functions: ["Page"],
        classes: [],
        imports: ["react", "@/lib/utils"],
        exports: ["Page"],
        functionSignatures: [
          {
            name: "Page",
            params: [],
            returnType: "JSX.Element",
            isAsync: false,
            isExported: true,
            startLine: 5,
            endLine: 20,
          },
        ],
      },
      {
        path: "src/lib/utils.ts",
        language: "TypeScript",
        lines: 30,
        complexity: 2,
        maintainability: 80,
        description: "Utility functions",
        issues: 1,
        functions: ["formatDate", "parseUrl"],
        classes: [],
        imports: [],
        exports: ["formatDate", "parseUrl"],
        functionSignatures: [
          {
            name: "formatDate",
            params: ["date"],
            returnType: "string",
            isAsync: false,
            isExported: true,
            startLine: 1,
            endLine: 5,
          },
          {
            name: "parseUrl",
            params: ["url"],
            returnType: "URL",
            isAsync: false,
            isExported: true,
            startLine: 7,
            endLine: 10,
          },
        ],
      },
      {
        path: "src/config.js",
        language: "JavaScript",
        lines: 20,
        complexity: 1,
        maintainability: 90,
        description: "Config file",
        issues: 0,
        functions: [],
        classes: [],
        imports: [],
        exports: [],
      },
    ],
    snippets: [
      {
        file: "src/app/page.tsx",
        language: "TypeScript",
        code: "export function Page() { return <div>Hello</div> }",
        title: "Main page",
        explanation: "Entry point",
        rawContent: "export function Page() {\n  return <div>Hello</div>\n}\n",
      },
    ],
    diagrams: {
      uml: "",
      sequence: "",
      erd: "",
      umlExplanation: "",
      sequenceExplanation: "",
      erdExplanation: "",
    },
    deadCode: [{ path: "src/old.ts", lines: 10, reason: "No imports" }],
    duplicates: [{ group: 1, files: ["src/a.ts", "src/b.ts"], lines: 15 }],
    maintainabilityTrend: [],
    architecture: {
      pattern: "Layered",
      description: "Standard layered architecture",
      layers: [
        { name: "UI", responsibility: "Components", files: 1 },
        { name: "Utils", responsibility: "Helpers", files: 1 },
      ],
      strengths: ["Clear separation"],
      weaknesses: ["Tight coupling in utils"],
      metrics: {
        avgCoupling: 0.3,
        avgCohesion: 0.7,
        instability: 0.4,
        abstractness: 0.2,
        distanceFromMain: 0.15,
        fanInAvg: 1.5,
        fanOutAvg: 0.8,
        layerViolations: ["UI imports from Utils directly"],
        godModules: [],
        dirCircularDeps: [],
        fileCircularDeps: 0,
      },
    },
    technicalDebt: {
      score: 35,
      items: [{ title: "Refactor utils", impact: "medium", estimate: "2h" }],
    },
    roadmap: [],
    monetization: [],
    documentation: {
      readme: "",
      apiDocs: "",
      architectureMd: "",
      folderGuide: "",
      componentGuide: "",
      deploymentGuide: "",
    },
    activity: [],
    complexityTrend: [],
  };
}

// ─── Tests ───

describe("SPM Builder", () => {
  const report = createSampleReport();

  describe("buildSPM", () => {
    it("should return ok with valid report", () => {
      const result = buildSPM(report);
      expect(result.ok).toBe(true);
    });

    it("should return error for null report", () => {
      const result = buildSPM(null as any);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SPM_NOT_INITIALIZED");
      }
    });

    it("should return error for report without repoOwner", () => {
      const result = buildSPM({ ...report, repoOwner: "" } as any);
      expect(result.ok).toBe(false);
    });

    it("should map identity fields correctly", () => {
      const result = buildSPM(report, "analysis-123");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const spm = result.value;
      expect(spm.id).toBe("analysis-123");
      expect(spm.repoOwner).toBe("test");
      expect(spm.repoName).toBe("sample-repo");
      expect(spm.branch).toBe("main");
      expect(spm.schemaVersion).toBe(1);
    });

    it("should derive ID from repo info when analysisId not provided", () => {
      const result = buildSPM(report);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.id).toBe("test/sample-repo/main");
    });

    it("should map files correctly", () => {
      const result = buildSPM(report);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const spm = result.value;
      expect(spm.files).toHaveLength(3);
      expect(spm.files[0].path).toBe("src/app/page.tsx");
      expect(spm.files[0].language).toBe("TypeScript");
      expect(spm.files[0].lines).toBe(50);
      expect(spm.files[0].content).toContain("export function Page");
      expect(spm.files[0].imports).toEqual(["react", "@/lib/utils"]);
      expect(spm.files[0].symbols.length).toBeGreaterThan(0);
    });

    it("should map symbols from functionSignatures", () => {
      const result = buildSPM(report);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const spm = result.value;
      const pageSymbol = spm.symbols.find((s) => s.name === "Page" && s.kind === "function");
      expect(pageSymbol).toBeDefined();
      expect(pageSymbol!.file).toBe("src/app/page.tsx");
      expect(pageSymbol!.exported).toBe(true);
      expect(pageSymbol!.returnType).toBe("JSX.Element");
    });

    it("should map symbols from classes", () => {
      const result = buildSPM(report);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // No classes in test data, but verify no crash
      const spm = result.value;
      expect(spm.symbols.filter((s) => s.kind === "class")).toHaveLength(0);
    });

    it("should map import symbols", () => {
      const result = buildSPM(report);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const spm = result.value;
      const importSymbols = spm.symbols.filter((s) => s.kind === "import");
      expect(importSymbols.length).toBeGreaterThan(0);
    });

    it("should map edges (dependencies + imports)", () => {
      const result = buildSPM(report);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const spm = result.value;
      const depEdges = spm.edges.filter((e) => e.type === "depends_on");
      const impEdges = spm.edges.filter((e) => e.type === "imports");
      expect(depEdges.length).toBe(1);
      expect(impEdges.length).toBeGreaterThan(0);
    });

    it("should map issues from all 3 categories", () => {
      const result = buildSPM(report);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const spm = result.value;
      expect(spm.issues).toHaveLength(3);
      expect(spm.issues.filter((i) => i.category === "security")).toHaveLength(1);
      expect(spm.issues.filter((i) => i.category === "bugs")).toHaveLength(1);
      expect(spm.issues.filter((i) => i.category === "performance")).toHaveLength(1);
    });

    it("should map issue fields correctly", () => {
      const result = buildSPM(report);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const spm = result.value;
      const secIssue = spm.issues.find((i) => i.category === "security");
      expect(secIssue).toBeDefined();
      expect(secIssue!.severity).toBe("critical");
      expect(secIssue!.title).toBe("SQL Injection");
      expect(secIssue!.file).toBe("src/app/api/route.ts");
      expect(secIssue!.effort).toBe("small");
    });

    it("should map architecture correctly", () => {
      const result = buildSPM(report);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const spm = result.value;
      expect(spm.architecture.pattern).toBe("Layered");
      expect(spm.architecture.strengths).toContain("Clear separation");
      expect(spm.architecture.weaknesses).toContain("Tight coupling in utils");
      expect(spm.architecture.layers).toEqual(["UI", "Utils"]);
      expect(spm.architecture.layerViolations).toContain("UI imports from Utils directly");
    });

    it("should map metrics correctly", () => {
      const result = buildSPM(report);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const spm = result.value;
      expect(spm.metrics.totalFiles).toBe(3);
      expect(spm.metrics.totalLines).toBe(150);
      expect(spm.metrics.totalSymbols).toBeGreaterThan(0);
      expect(spm.metrics.totalEdges).toBeGreaterThan(0);
      expect(spm.metrics.maintainabilityIndex).toBe(65);
      expect(spm.metrics.couplingScore).toBe(0.3);
      expect(spm.metrics.cohesionScore).toBe(0.7);
    });

    it("should map insights from deepAnalysis", () => {
      const reportWithDeep = {
        ...report,
        deepAnalysis: {
          aiOverview: { healthAssessment: "Good health" },
          executiveSummary: "Repo is stable",
          securityReview: [{ title: "Fix SQLi" }],
        },
      } as any;
      const result = buildSPM(reportWithDeep);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const spm = result.value;
      expect(spm.insights).toHaveLength(3);
      expect(spm.insights.find((i) => i.type === "overview")).toBeDefined();
      expect(spm.insights.find((i) => i.type === "summary")).toBeDefined();
      expect(spm.insights.find((i) => i.type === "security")).toBeDefined();
    });

    it("should return empty insights when no deepAnalysis", () => {
      const result = buildSPM(report);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.insights).toHaveLength(0);
    });
  });

  describe("SPM Serializer", () => {
    it("should round-trip serialize/deserialize", () => {
      const buildResult = buildSPM(report, "test-123");
      expect(buildResult.ok).toBe(true);
      if (!buildResult.ok) return;
      const spm = buildResult.value;

      const json = serializeSPM(spm);
      const deserResult = deserializeSPM(json);
      expect(deserResult.ok).toBe(true);
      if (!deserResult.ok) return;
      const restored = deserResult.value;

      expect(restored.id).toBe(spm.id);
      expect(restored.repoOwner).toBe(spm.repoOwner);
      expect(restored.files).toHaveLength(spm.files.length);
      expect(restored.symbols).toHaveLength(spm.symbols.length);
      expect(restored.issues).toHaveLength(spm.issues.length);
    });

    it("should return error for invalid JSON", () => {
      const result = deserializeSPM("{ not valid json");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SPM_NOT_INITIALIZED");
      }
    });

    it("should return error for non-object JSON", () => {
      const result = deserializeSPM('"just a string"');
      expect(result.ok).toBe(false);
    });

    it("should warn on schema version mismatch but still return data", () => {
      const buildResult = buildSPM(report);
      expect(buildResult.ok).toBe(true);
      if (!buildResult.ok) return;
      const spm = buildResult.value;
      const json = serializeSPM({ ...spm, schemaVersion: 999 });
      const result = deserializeSPM(json);
      expect(result.ok).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("should handle report with 0 issues", () => {
      const emptyReport = {
        ...report,
        issues: { bugs: [], security: [], performance: [] },
      };
      const result = buildSPM(emptyReport);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.issues).toHaveLength(0);
    });

    it("should handle report with 0 files", () => {
      const emptyReport = {
        ...report,
        files: [],
        snippets: [],
      };
      const result = buildSPM(emptyReport);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.files).toHaveLength(0);
      expect(result.value.symbols).toHaveLength(0);
    });

    it("should handle report with missing optional fields", () => {
      const minimalReport = {
        ...report,
        architecture: {
          pattern: "Unknown",
          description: "",
          layers: [],
          strengths: [],
          weaknesses: [],
        },
      } as any;
      const result = buildSPM(minimalReport);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.architecture.layerViolations).toEqual([]);
    });
  });
});
