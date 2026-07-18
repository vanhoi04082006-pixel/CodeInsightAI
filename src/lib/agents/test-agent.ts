// CodeInsight AI — Test Agent (Prompt 6)
// Generates comprehensive unit / integration / e2e tests for a source file.
// Falls back to a describe/it skeleton for each exported function when no provider is available.

import type { AgentId, AgentInfo, Task, TaskResult } from "./types";
import { BaseAgent } from "./base-agent";
import { callAI, type AIProviderConfig, type AIMessage } from "./ai-client";
import { repositoryMemory } from "./repository-memory";

/* ────────────── Input shapes ────────────── */

interface TestInput {
  filePath?: string;
  content?: string;
  testType?: "unit" | "integration" | "e2e";
  framework?: string;
  provider?: AIProviderConfig;
  repositoryUrl?: string;
}

/* ────────────── Output shape ────────────── */

interface TestOutput {
  testPath: string;
  testContent: string;
  framework: string;
  testType: "unit" | "integration" | "e2e";
  exportsCovered: string[];
}

/* ────────────── Agent ────────────── */

export class TestAgent extends BaseAgent {
  readonly id: AgentId = "test-agent";
  readonly info: AgentInfo = {
    id: "test-agent",
    name: "Test Agent",
    description:
      "Generates comprehensive unit, integration, or e2e tests for a source file — happy path, edge cases, and error cases.",
    capabilities: [
      { kind: "test", description: "Generate a test file covering happy path, edge cases, and error cases." },
    ],
    icon: "FlaskConical",
    color: "#34d399",
  };

  protected async execute(
    task: Task,
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<TaskResult> {
    const input = (task.input ?? {}) as TestInput;
    const provider = input.provider;
    const repoUrl = input.repositoryUrl;
    const filePath = input.filePath ?? "source.ts";
    const sourceContent = input.content ?? "";
    const framework = (input.framework ?? "vitest").toLowerCase();
    const testType: "unit" | "integration" | "e2e" = clampTestType(input.testType);

    if (!sourceContent.trim()) {
      return {
        success: false,
        data: null,
        summary: "Test Agent received empty source content.",
        artifacts: [],
      };
    }

    onProgress(10, "Analyzing source file — exports, edge cases");
    const exportsList = extractExports(sourceContent);
    if (signal.aborted) return cancelled(this.info.name);

    const testPath = buildTestPath(filePath);

    let testContent: string;
    if (provider) {
      onProgress(30, "Building test-generation prompt");
      try {
        testContent = await this.generateWithAI(
          provider,
          sourceContent,
          filePath,
          framework,
          testType,
          exportsList,
          signal,
          onProgress,
        );
      } catch (err) {
        this.log("warn", `AI test generation failed — falling back to skeleton: ${(err as Error).message}`);
        testContent = this.skeletonTest(filePath, sourceContent, framework, testType, exportsList);
      }
    } else {
      onProgress(30, "No AI provider — generating skeleton tests");
      testContent = this.skeletonTest(filePath, sourceContent, framework, testType, exportsList);
    }

    if (signal.aborted) return cancelled(this.info.name);

    onProgress(80, "Validating test syntax");
    const validation = validateTest(testContent, framework);
    if (!validation.ok) {
      this.log("warn", `Test validation warning: ${validation.reason}`);
      // Don't fail the whole task — tests may still be useful — but record the warning.
    }

    onProgress(100, "Test file ready");
    this.recordDecision(
      task.id,
      `Generated ${testType} tests for ${filePath} (${framework}) — ${exportsList.length} export(s) covered`,
      validation.ok ? "Validation passed." : `Validation: ${validation.reason}`,
    );

    if (repoUrl) {
      try {
        await repositoryMemory.remember(
          repoUrl,
          `tests:${task.id}:${filePath}`,
          { testPath, framework, testType, exportsCovered: exportsList },
          "decision",
        );
      } catch {
        // best-effort
      }
    }

    this.log("info", `Generated ${testType} test for ${filePath} → ${testPath}`);

    const output: TestOutput = {
      testPath,
      testContent,
      framework,
      testType,
      exportsCovered: exportsList,
    };

    return {
      success: true,
      data: output,
      summary: `Generated ${testType} test file for ${filePath} (${framework}).`,
      artifacts: [
        {
          kind: "file",
          path: testPath,
          content: testContent,
          language: detectLanguage(filePath),
          meta: { framework, testType, sourcePath: filePath, exportsCovered: exportsList.length },
        },
      ],
      metrics: {
        exportsCovered: exportsList.length,
        testLines: testContent.split("\n").length,
      },
    };
  }

  /* ────── AI generation ────── */

  private async generateWithAI(
    provider: AIProviderConfig,
    source: string,
    filePath: string,
    framework: string,
    testType: "unit" | "integration" | "e2e",
    exportsList: string[],
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<string> {
    const frameworkHint = FRAMEWORK_HINTS[framework] ?? FRAMEWORK_HINTS.vitest;
    const exportsHint = exportsList.length > 0
      ? `Detected exports: ${exportsList.join(", ")}.`
      : "No top-level exports detected — infer the public API from the file content.";

    const system: AIMessage = {
      role: "system",
      content:
        "You are a senior test engineer. Generate thorough, well-isolated tests covering the happy path, edge cases, and error cases. " +
        "Tests must be deterministic (no real timers, no network, no flakiness). Use the requested framework's idioms.",
    };
    const user: AIMessage = {
      role: "user",
      content:
        `Generate a ${testType} test file using ${framework} for the source file below.\n\n` +
        `${frameworkHint}\n` +
        `${exportsHint}\n\n` +
        `Test type: ${testType}. ` +
        (testType === "unit"
          ? "Mock external dependencies. Test individual functions/components in isolation."
          : testType === "integration"
            ? "Test the interactions between modules. Use real implementations where practical; mock only network/DB."
            : "Drive the full user flow end-to-end. Use real or near-real environment.") +
        "\n\n" +
        "Return ONLY the test file content — no explanation, no markdown fences.\n\n" +
        `### SOURCE: ${filePath}\n\`\`\`\n${truncate(source, 8000)}\n\`\`\``,
    };

    onProgress(60, "Calling AI to generate test file");
    const reply = await callAI(provider, [system, user], { temperature: 0.2, maxTokens: 6000, signal });
    // Strip stray markdown fences if the model added them despite instructions.
    return stripCodeFences(reply && reply.trim() ? reply : this.skeletonTest(filePath, source, framework, testType, exportsList));
  }

  /* ────── Skeleton fallback ────── */

  private skeletonTest(
    filePath: string,
    source: string,
    framework: string,
    testType: "unit" | "integration" | "e2e",
    exportsList: string[],
  ): string {
    const importPath = relativeImportPath(filePath);
    const { importStmt, describeImport, itImport, expectImport, beforeEachImport, afterEachImport } = frameworkImports(framework);
    const header: string[] = [];
    header.push(`// Auto-generated ${testType} test skeleton — ${framework}`);
    header.push(`// Source: ${filePath}`);
    header.push(`// Generated by CodeInsight AI Test Agent. Fill in the assertions.`);
    header.push("");
    header.push(`${importStmt} { ${exportsList.length > 0 ? exportsList.join(", ") : "/* exported names */"} } from "${importPath}";`);
    header.push("");
    header.push(`${describeImport}("${filePath}", () => {`);

    const targets = exportsList.length > 0 ? exportsList : ["the module"];

    for (const name of targets) {
      header.push(`  ${describeImport}("${name}", () => {`);
      header.push(`    ${itImport}("happy path — should work as expected", () => {`);
      header.push(`      ${expectImport}.true(true); // TODO: assert behavior of ${name}`);
      header.push(`    });`);
      header.push("");
      header.push(`    ${itImport}("edge case — handles empty/zero/null input", () => {`);
      header.push(`      ${expectImport}.true(true); // TODO: assert edge-case behavior of ${name}`);
      header.push(`    });`);
      header.push("");
      header.push(`    ${itImport}("error case — throws or returns error on invalid input", () => {`);
      header.push(`      ${expectImport}.true(true); // TODO: assert error behavior of ${name}`);
      header.push(`    });`);
      header.push(`  });`);
      header.push("");
    }

    if (testType !== "unit") {
      header.push(`  ${beforeEachImport}(() => {`);
      header.push(`    // setup: initialize shared state, stub external services`);
      header.push(`  });`);
      header.push("");
      header.push(`  ${afterEachImport}(() => {`);
      header.push(`    // teardown: restore stubs, clear state`);
      header.push(`  });`);
      header.push("");
    }

    header.push(`});`);
    header.push("");
    // Suppress unused-source warning (skeleton reference).
    void source;
    return header.join("\n");
  }
}

/* ────────────── Source analysis ────────────── */

function extractExports(source: string): string[] {
  const names = new Set<string>();
  // export function Foo / export const Foo / export class Foo / export async function Foo
  const re1 = /export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|let|var)\s+([A-Za-z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(source)) !== null) names.add(m[1]);
  // export { Foo, Bar, Baz }
  const re2 = /export\s*\{([^}]+)\}/g;
  while ((m = re2.exec(source)) !== null) {
    for (let part of m[1].split(",")) {
      part = part.trim();
      if (!part) continue;
      // handle "Foo as Bar"
      const alias = part.split(/\s+as\s+/);
      names.add(alias[alias.length - 1].trim());
    }
  }
  // export default function (anonymous)
  if (/export\s+default\s+(?:async\s+)?function\s*\(/.test(source)) {
    names.add("default");
  }
  return Array.from(names).slice(0, 30);
}

/* ────────────── Path helpers ─────────────️ */

function buildTestPath(sourcePath: string): string {
  const slashIdx = sourcePath.lastIndexOf("/");
  const dotIdx = sourcePath.lastIndexOf(".");
  if (dotIdx <= slashIdx) return `${sourcePath}.test`;
  const base = sourcePath.slice(0, dotIdx);
  const ext = sourcePath.slice(dotIdx); // includes the dot
  return `${base}.test${ext}`;
}

function relativeImportPath(testPath: string): string {
  // For a co-located test file, importing the source is just "./basename".
  const base = testPath.split("/").pop() ?? testPath;
  // Strip the inserted ".test" segment if present.
  return "./" + base.replace(/\.test\./, ".");
}

function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    go: "go",
    rs: "rust",
    rb: "ruby",
  };
  return map[ext] ?? "text";
}

/* ────────────── Framework helpers ────────────── */

const FRAMEWORK_HINTS: Record<string, string> = {
  vitest: "Use vitest: `import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'`.",
  jest: "Use Jest: `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `jest.fn()`, `jest.mock()`.",
  mocha: "Use Mocha + Chai: `describe`, `it`, `expect` from chai.",
  jasmine: "Use Jasmine: `describe`, `it`, `expect`, `beforeEach`, `afterEach`.",
  playwright: "Use Playwright Test: `import { test, expect } from '@playwright/test'`.",
  cypress: "Use Cypress: `describe`, `it`, `cy.*` commands.",
  pytest: "Use pytest: `def test_*()` functions, `assert` statements, `@pytest.fixture`.",
  unittest: "Use unittest: `class XTest(unittest.TestCase)` with `def test_*` methods.",
};

interface FrameworkImports {
  importStmt: string;
  describeImport: string;
  itImport: string;
  expectImport: string;
  beforeEachImport: string;
  afterEachImport: string;
}

function frameworkImports(framework: string): FrameworkImports {
  const f = framework.toLowerCase();
  if (f === "pytest") {
    // Python pytest uses plain functions — but the skeleton is JS-shaped; we still emit JS-ish.
    return {
      importStmt: "from",
      describeImport: "describe",
      itImport: "it",
      expectImport: "assert",
      beforeEachImport: "setup",
      afterEachImport: "teardown",
    };
  }
  // All JS-family frameworks (vitest, jest, mocha+chai, jasmine) use these globals / imports.
  const needsImport = f === "vitest";
  if (needsImport) {
    return {
      importStmt: "import",
      describeImport: "describe",
      itImport: "it",
      expectImport: "expect",
      beforeEachImport: "beforeEach",
      afterEachImport: "afterEach",
    };
  }
  // Jest / Mocha / Jasmine globals.
  return {
    importStmt: "import",
    describeImport: "describe",
    itImport: "it",
    expectImport: "expect",
    beforeEachImport: "beforeEach",
    afterEachImport: "afterEach",
  };
}

/* ────────────── Validation ────────────── */

interface ValidationOutcome {
  ok: boolean;
  reason: string;
}

function validateTest(testContent: string, framework: string): ValidationOutcome {
  if (!testContent.trim()) return { ok: false, reason: "test content is empty" };
  if (framework === "pytest") {
    if (!/def\s+test_/.test(testContent)) return { ok: false, reason: "no test_ functions found" };
    return { ok: true, reason: "ok" };
  }
  // JS-family tests should have at least one describe and one it/test.
  if (!/\bdescribe\s*\(/.test(testContent) && !/\btest\s*\(/.test(testContent)) {
    return { ok: false, reason: "no describe()/test() blocks found" };
  }
  if (!/\b(it|test)\s*\(/.test(testContent)) {
    return { ok: false, reason: "no it()/test() cases found" };
  }
  // Balanced braces check.
  const counts = countBraces(testContent);
  if (counts.braces !== 0) return { ok: false, reason: `unbalanced curly braces (delta ${counts.braces})` };
  if (counts.parens !== 0) return { ok: false, reason: `unbalanced parentheses (delta ${counts.parens})` };
  return { ok: true, reason: "ok" };
}

function countBraces(src: string): { braces: number; parens: number } {
  const s = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\.|[^`\\])*`/g, "``");
  const braces = (s.match(/{/g) ?? []).length - (s.match(/}/g) ?? []).length;
  const parens = (s.match(/\(/g) ?? []).length - (s.match(/\)/g) ?? []).length;
  return { braces, parens };
}

/* ────────────── Misc helpers ─────────────️ */

function clampTestType(t: unknown): "unit" | "integration" | "e2e" {
  return t === "integration" || t === "e2e" ? t : "unit";
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    // Remove leading fence (with optional language tag) and trailing fence.
    const firstNewline = trimmed.indexOf("\n");
    if (firstNewline !== -1) {
      const body = trimmed.slice(firstNewline + 1);
      return body.replace(/```\s*$/, "").trim();
    }
  }
  return trimmed;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + "\n… [truncated]";
}

function cancelled(agentName: string): TaskResult {
  return {
    success: false,
    data: null,
    summary: `${agentName} cancelled before completion.`,
    artifacts: [],
  };
}

export const testAgent = new TestAgent();
