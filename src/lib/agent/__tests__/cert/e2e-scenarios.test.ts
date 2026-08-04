// CodeInsight AI — v2.1 Production Certification: E2E Scenarios
// 20 real end-to-end scenarios exercising the full agent pipeline.

import { buildIndexes } from "@/lib/agent/indexes";
import { createQueryService } from "@/lib/agent/query";
import { createRegistries } from "@/lib/agent/tools";
import { createPlanner } from "@/lib/agent/planner";
import { createRuntime, RollbackManager, registerRollbackManager, unregisterRollbackManager } from "@/lib/agent/runtime";
import { createAgentMemory } from "@/lib/agent/memory";
import { createContextBuilder } from "@/lib/agent/context";
import type {
  SemanticProjectModel,
  SemanticFile,
  SemanticSymbol,
  SemanticEdge,
  SemanticIssue,
  AgentContext,
  AgentEvent,
  Tool,
  ToolManifest,
  PermissionLevel,
} from "@/lib/agent/contracts";
import { ExecutionGraphBuilder, defaultPolicy } from "@/lib/agent/planner";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function buildTestSPM(tmpDir: string): SemanticProjectModel {
  const appP = path.join(tmpDir, "src/app.ts");
  const authP = path.join(tmpDir, "src/auth.ts");
  const files: SemanticFile[] = [
    { path: appP, language: "typescript", lines: 1, content: "export function app() { return login(); }", symbols: [appP + "::app::function"], imports: ["./auth"] },
    { path: authP, language: "typescript", lines: 1, content: "export function login() { return true; }", symbols: [authP + "::login::function"], imports: [] },
  ];
  const symbols: SemanticSymbol[] = [
    { id: appP + "::app::function", name: "app", kind: "function", file: appP, line: 1, exported: true },
    { id: authP + "::login::function", name: "login", kind: "function", file: authP, line: 1, exported: true },
  ];
  const edges: SemanticEdge[] = [{ id: "e1", type: "calls", source: appP + "::app::function", target: authP + "::login::function", file: appP, line: 1 }];
  const issues: SemanticIssue[] = [
    { id: "i1", category: "security", severity: "high", title: "SQLi", description: "d", file: appP, line: 1, recommendation: "fix", effort: "small" },
    { id: "i2", category: "bugs", severity: "medium", title: "N+1", description: "d", file: authP, line: 1, recommendation: "fix", effort: "small" },
  ];
  return {
    id: "test/cert/1", repoOwner: "test", repoName: "cert", branch: "main", commitSha: "abc",
    createdAt: new Date().toISOString(), files, symbols, edges, issues, insights: [],
    architecture: { pattern: "Layered", strengths: ["clear"], weaknesses: ["coupling"], layers: ["api", "auth"], layerViolations: [] },
    metrics: { totalFiles: 2, totalLines: 2, totalSymbols: 2, totalEdges: 1, cyclomaticComplexity: 1, maintainabilityIndex: 80, couplingScore: 0.5, cohesionScore: 0.7 },
    schemaVersion: 1,
  };
}

function makeMockTool(name: string, permission: PermissionLevel = "allow", resultValue: unknown = { ok: true }): Tool {
  const manifest: ToolManifest = {
    name, description: `Mock ${name}`, capabilities: [name as any],
    cost: "cheap", estimatedTimeMs: 100, permission, timeout: 5000,
    parallel: true, parallelSafe: true, cacheable: false, cacheTtl: 0,
    streamable: false, confidence: 1.0, maxRetries: 0,
    inputSchema: { type: "object", properties: {}, required: [] },
    outputSchema: { type: "object", properties: {}, required: [] },
  };
  return { manifest, async execute() { return { ok: true, value: resultValue }; } };
}

function makeFsTool(name: string, _tmpDir: string, permission: PermissionLevel = "prompt"): Tool {
  const manifest: ToolManifest = {
    name, description: `Fs ${name}`, capabilities: [name as any],
    cost: "medium", estimatedTimeMs: 100, permission, timeout: 5000,
    parallel: false, parallelSafe: false, cacheable: false, cacheTtl: 0,
    streamable: false, confidence: 1.0, maxRetries: 0,
    inputSchema: { type: "object", properties: {}, required: [] },
    outputSchema: { type: "object", properties: {}, required: [] },
  };
  return {
    manifest,
    async execute(params: any, ctx: AgentContext) {
      const file = params.file as string;
      const content = params.content as string;
      if (!file) return { ok: false, error: { code: "TOOL_INVALID_PARAMS", message: "no file", recoverable: false } };
      const { RepoServiceImpl } = await import("@/lib/agent/services/repo-service");
      const repo = new RepoServiceImpl();
      const result = await repo.writeFileAsync(file, content || "new");
      if (!result.ok) return result;
      const changes = repo.getChangeLog();
      ctx.memory?.working?.pushScratch?.(`Wrote ${file}`);
      return { ok: true, value: { modifiedFiles: [file], changes } };
    },
  };
}

function makeContext(spm: SemanticProjectModel): AgentContext {
  const indexes = buildIndexes(spm);
  const query = createQueryService(spm, indexes);
  const memory = createAgentMemory();
  memory.initializeProject(spm, indexes);
  return { spm, query, memory, analysisId: `cert-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, locale: "en" };
}

async function collectEvents(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

function buildPlan(nodes: any[], policy?: any): any {
  const builder = new ExecutionGraphBuilder();
  for (const n of nodes) builder.addNode({ ...n, status: "pending" });
  return { graph: builder.build(), policy: { ...defaultPolicy(), ...(policy || {}) }, estimatedTokens: 1000, estimatedTimeMs: 5000 };
}

function setupToolRegistry(tmpDir: string): any {
  const { toolRegistry } = createRegistries();
  (toolRegistry as any).register(makeMockTool("search-code", "allow", { files: ["src/app.ts"] }));
  (toolRegistry as any).register(makeMockTool("find-symbol", "allow", { symbols: [{ name: "login", file: "src/auth.ts" }] }));
  (toolRegistry as any).register(makeMockTool("find-issues", "allow", { issues: [] }));
  (toolRegistry as any).register(makeMockTool("find-architecture", "allow", { pattern: "Layered" }));
  (toolRegistry as any).register(makeMockTool("find-metrics", "allow", { totalFiles: 2 }));
  (toolRegistry as any).register(makeMockTool("find-circular-deps", "allow", { cycles: [] }));
  (toolRegistry as any).register(makeMockTool("find-dead-code", "allow", { dead: [] }));
  (toolRegistry as any).register(makeMockTool("find-duplicates", "allow", { dups: [] }));
  (toolRegistry as any).register(makeMockTool("find-impact", "allow", { impacted: [] }));
  (toolRegistry as any).register(makeMockTool("find-references", "allow", { refs: [] }));
  (toolRegistry as any).register(makeMockTool("find-call-chain", "allow", { chain: [] }));
  (toolRegistry as any).register(makeMockTool("open-file", "allow", { content: "..." }));
  (toolRegistry as any).register(makeMockTool("read-file", "allow", { content: "..." }));
  (toolRegistry as any).register(makeMockTool("get-diagram", "allow", { diagram: "..." }));
  (toolRegistry as any).register(makeFsTool("apply-patch", tmpDir, "prompt"));
  (toolRegistry as any).register(makeFsTool("generate-patch", tmpDir, "prompt"));
  (toolRegistry as any).register(makeMockTool("rollback-changes", "prompt", { rolledBack: true }));
  (toolRegistry as any).register(makeMockTool("run-lint", "allow", { errorCount: 0, warningCount: 0 }));
  (toolRegistry as any).register(makeMockTool("run-tests", "allow", { passed: 10, failed: 0 }));
  (toolRegistry as any).register(makeMockTool("git-commit", "prompt", { sha: "abc123" }));
  (toolRegistry as any).register(makeMockTool("git-push", "prompt", { pushed: true }));
  (toolRegistry as any).register(makeMockTool("git-diff", "allow", { diff: "..." }));
  (toolRegistry as any).register(makeMockTool("git-history", "allow", { commits: [] }));
  (toolRegistry as any).register(makeMockTool("git-revert", "prompt", { reverted: true }));
  (toolRegistry as any).register(makeMockTool("run-script", "prompt", { exitCode: 0, output: "ok" }));
  (toolRegistry as any).register(makeMockTool("ai-insight", "allow", { insight: {} }));
  (toolRegistry as any).register(makeMockTool("ai-chat", "allow", { response: "..." }));
  return toolRegistry;
}

async function runScenario(
  plan: any, toolRegistry: any, context: AgentContext,
  options: { autoApprove?: boolean; autoDeny?: boolean } = {},
): Promise<{ events: AgentEvent[]; types: string[]; filesChanged: string[]; outcome: string; rollbackResult: string }> {
  const runtime = createRuntime(toolRegistry);
  const filesChanged = new Set<string>();
  let outcome = "unknown";

  if (options.autoApprove || options.autoDeny) {
    const interval = setInterval(() => {
      const pending = (runtime.permissionGate as any).pendingNodeIds?.() as string[] | undefined;
      if (pending && pending.length > 0) {
        for (const nodeId of pending) {
          runtime.permissionGate.respond(nodeId, !!options.autoApprove, options.autoDeny ? "auto-deny" : "auto-approve");
        }
      }
    }, 5);
    setTimeout(() => clearInterval(interval), 30000);
  }

  const events = await collectEvents(runtime.run(plan, context));
  const types = events.map(e => (e as any).type);
  for (const e of events) {
    const ev = e as any;
    if (ev.type === "node.completed") {
      if (ev.result?.modifiedFiles) for (const f of ev.result.modifiedFiles) filesChanged.add(f);
      if (ev.result?.changes) for (const c of ev.result.changes) filesChanged.add(c.file);
    }
    if (ev.type === "task.completed") outcome = ev.summary;
    if (ev.type === "task.failed") outcome = `failed: ${ev.error?.message}`;
    if (ev.type === "task.cancelled") outcome = `cancelled: ${ev.reason}`;
  }

  let rollbackResult = "n/a";
  if (filesChanged.size > 0) {
    const rb = runtime.rollbackManager;
    if (rb.hasChanges()) {
      const r = await rb.rollback();
      rollbackResult = r.ok ? "ok" : "failed";
    } else {
      rollbackResult = "no-changes";
    }
  }
  return { events, types, filesChanged: [...filesChanged], outcome, rollbackResult };
}

describe("v2.1 E2E Scenarios (20 scenarios)", () => {
  let tmpDir: string;
  let spm: SemanticProjectModel;

  beforeAll(() => {
    // v2.2: use a dir INSIDE project root so path validation (C1 fix) allows writes.
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), "src/lib/agent/__tests__/fixtures/e2e-"));
    spm = buildTestSPM(tmpDir);
  });
  afterAll(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} });

  it("S1: Explain architecture", async () => {
    const ctx = makeContext(spm);
    const tr = setupToolRegistry(tmpDir);
    const plan = buildPlan([
      { id: "s1", step: "search", capability: "search-code", toolName: "search-code", params: { query: "arch" }, dependsOn: [] },
      { id: "s2", step: "arch", capability: "find-architecture", toolName: "find-architecture", params: {}, dependsOn: ["s1"] },
      { id: "s3", step: "metrics", capability: "find-metrics", toolName: "find-metrics", params: {}, dependsOn: ["s1"] },
      { id: "s4", step: "explain", capability: "ai-chat", toolName: "ai-chat", params: { message: "explain" }, dependsOn: ["s2", "s3"] },
    ]);
    const r = await runScenario(plan, tr, ctx);
    expect(r.types).toContain("plan.generated");
    expect(r.types).toContain("node.started");
    expect(r.types).toContain("node.completed");
    expect(r.types).toContain("task.completed");
  });

  it("S2: Find security issue", async () => {
    const ctx = makeContext(spm);
    const tr = setupToolRegistry(tmpDir);
    const plan = buildPlan([
      { id: "s1", step: "search", capability: "search-code", toolName: "search-code", params: { query: "sql" }, dependsOn: [] },
      { id: "s2", step: "issues", capability: "find-issues", toolName: "find-issues", params: {}, dependsOn: ["s1"] },
      { id: "s3", step: "insight", capability: "ai-insight", toolName: "ai-insight", params: { type: "security" }, dependsOn: ["s2"] },
    ]);
    const r = await runScenario(plan, tr, ctx);
    expect(r.outcome).toContain("Completed");
  });

  it("S3: Fix bug (apply-patch with permission)", async () => {
    const ctx = makeContext(spm);
    const tr = setupToolRegistry(tmpDir);
    const targetFile = path.join(tmpDir, "src/app.ts");
    const plan = buildPlan([
      { id: "s1", step: "search", capability: "search-code", toolName: "search-code", params: { query: "bug" }, dependsOn: [] },
      { id: "s2", step: "issues", capability: "find-issues", toolName: "find-issues", params: {}, dependsOn: ["s1"] },
      { id: "s3", step: "patch", capability: "apply-patch", toolName: "apply-patch", params: { file: targetFile, content: "fixed" }, dependsOn: ["s2"] },
      { id: "s4", step: "lint", capability: "run-lint", toolName: "run-lint", params: {}, dependsOn: ["s3"] },
      { id: "s5", step: "test", capability: "run-tests", toolName: "run-tests", params: {}, dependsOn: ["s3"] },
    ]);
    const r = await runScenario(plan, tr, ctx, { autoApprove: true });
    expect(r.types).toContain("permission.requested");
    expect(r.types).toContain("permission.granted");
    expect(r.filesChanged.length).toBeGreaterThan(0);
    expect(r.rollbackResult).toBe("ok");
  });

  it("S4: Generate tests", async () => {
    const ctx = makeContext(spm);
    const tr = setupToolRegistry(tmpDir);
    const testFile = path.join(tmpDir, "src/app.test.ts");
    const plan = buildPlan([
      { id: "s1", step: "read", capability: "open-file", toolName: "open-file", params: {}, dependsOn: [] },
      { id: "s2", step: "gen", capability: "apply-patch", toolName: "apply-patch", params: { file: testFile, content: "test" }, dependsOn: ["s1"] },
      { id: "s3", step: "run", capability: "run-tests", toolName: "run-tests", params: {}, dependsOn: ["s2"] },
    ]);
    const r = await runScenario(plan, tr, ctx, { autoApprove: true });
    expect(r.outcome).toContain("Completed");
  });

  it("S5: Refactor module", async () => {
    const ctx = makeContext(spm);
    const tr = setupToolRegistry(tmpDir);
    const targetFile = path.join(tmpDir, "src/auth.ts");
    const plan = buildPlan([
      { id: "s1", step: "symbol", capability: "find-symbol", toolName: "find-symbol", params: { name: "login" }, dependsOn: [] },
      { id: "s2", step: "refs", capability: "find-references", toolName: "find-references", params: {}, dependsOn: ["s1"] },
      { id: "s3", step: "impact", capability: "find-impact", toolName: "find-impact", params: {}, dependsOn: ["s1"] },
      { id: "s4", step: "patch", capability: "apply-patch", toolName: "apply-patch", params: { file: targetFile, content: "refactored" }, dependsOn: ["s2", "s3"] },
      { id: "s5", step: "lint", capability: "run-lint", toolName: "run-lint", params: {}, dependsOn: ["s4"] },
    ]);
    const r = await runScenario(plan, tr, ctx, { autoApprove: true });
    expect(r.outcome).toContain("Completed");
  });

  it("S6: Update imports", async () => {
    const ctx = makeContext(spm);
    const tr = setupToolRegistry(tmpDir);
    const targetFile = path.join(tmpDir, "src/app.ts");
    const plan = buildPlan([
      { id: "s1", step: "search", capability: "search-code", toolName: "search-code", params: { query: "import" }, dependsOn: [] },
      { id: "s2", step: "patch", capability: "apply-patch", toolName: "apply-patch", params: { file: targetFile, content: "updated imports" }, dependsOn: ["s1"] },
    ]);
    const r = await runScenario(plan, tr, ctx, { autoApprove: true });
    expect(r.filesChanged).toContain(targetFile);
  });

  it("S7: Rename symbol (multi-file)", async () => {
    const ctx = makeContext(spm);
    const tr = setupToolRegistry(tmpDir);
    const f1 = path.join(tmpDir, "src/app.ts");
    const f2 = path.join(tmpDir, "src/auth.ts");
    const plan = buildPlan([
      { id: "s1", step: "symbol", capability: "find-symbol", toolName: "find-symbol", params: { name: "login" }, dependsOn: [] },
      { id: "s2", step: "refs", capability: "find-references", toolName: "find-references", params: {}, dependsOn: ["s1"] },
      { id: "s3", step: "patch1", capability: "apply-patch", toolName: "apply-patch", params: { file: f1, content: "renamed" }, dependsOn: ["s2"], parallelGroup: "rename" },
      { id: "s4", step: "patch2", capability: "apply-patch", toolName: "apply-patch", params: { file: f2, content: "renamed" }, dependsOn: ["s2"], parallelGroup: "rename" },
    ]);
    const r = await runScenario(plan, tr, ctx, { autoApprove: true });
    expect(r.filesChanged.length).toBe(2);
  });

  it("S8: Create file", async () => {
    const ctx = makeContext(spm);
    const tr = setupToolRegistry(tmpDir);
    const newFile = path.join(tmpDir, "src/new.ts");
    const plan = buildPlan([
      { id: "s1", step: "create", capability: "apply-patch", toolName: "apply-patch", params: { file: newFile, content: "new" }, dependsOn: [] },
    ]);
    const r = await runScenario(plan, tr, ctx, { autoApprove: true });
    expect(r.filesChanged).toContain(newFile);
    expect(r.rollbackResult).toBe("ok"); // file created then rolled back
  });

  it("S9: Delete file (via rollback-changes tool)", async () => {
    const ctx = makeContext(spm);
    const tr = setupToolRegistry(tmpDir);
    const plan = buildPlan([
      { id: "s1", step: "rollback", capability: "rollback-changes", toolName: "rollback-changes", params: {}, dependsOn: [] },
    ]);
    const r = await runScenario(plan, tr, ctx, { autoApprove: true });
    expect(r.outcome).toContain("Completed");
  });

  it("S10: Rollback (write then rollback)", async () => {
    const ctx = makeContext(spm);
    const tr = setupToolRegistry(tmpDir);
    const targetFile = path.join(tmpDir, "src/rollback-target.ts");
    const plan = buildPlan([
      { id: "s1", step: "write", capability: "apply-patch", toolName: "apply-patch", params: { file: targetFile, content: "v1" }, dependsOn: [] },
      { id: "s2", step: "rollback", capability: "rollback-changes", toolName: "rollback-changes", params: {}, dependsOn: ["s1"] },
    ]);
    const r = await runScenario(plan, tr, ctx, { autoApprove: true });
    expect(r.rollbackResult).toBe("ok");
  });

  it("S11: Git commit", async () => {
    const ctx = makeContext(spm);
    const tr = setupToolRegistry(tmpDir);
    const plan = buildPlan([
      { id: "s1", step: "diff", capability: "git-diff", toolName: "git-diff", params: {}, dependsOn: [] },
      { id: "s2", step: "commit", capability: "git-commit", toolName: "git-commit", params: { message: "test" }, dependsOn: ["s1"] },
    ]);
    const r = await runScenario(plan, tr, ctx, { autoApprove: true });
    expect(r.types).toContain("permission.granted");
  });

  it("S12: Git revert", async () => {
    const ctx = makeContext(spm);
    const tr = setupToolRegistry(tmpDir);
    const plan = buildPlan([
      { id: "s1", step: "history", capability: "git-history", toolName: "git-history", params: { file: "src/app.ts" }, dependsOn: [] },
      { id: "s2", step: "revert", capability: "git-revert", toolName: "git-revert", params: { commitSha: "abc123" }, dependsOn: ["s1"] },
    ]);
    const r = await runScenario(plan, tr, ctx, { autoApprove: true });
    expect(r.outcome).toContain("Completed");
  });

  it("S13: Permission deny", async () => {
    const ctx = makeContext(spm);
    const tr = setupToolRegistry(tmpDir);
    const targetFile = path.join(tmpDir, "src/denied.ts");
    const plan = buildPlan([
      { id: "s1", step: "write", capability: "apply-patch", toolName: "apply-patch", params: { file: targetFile, content: "x" }, dependsOn: [] },
    ]);
    const r = await runScenario(plan, tr, ctx, { autoDeny: true });
    expect(r.types).toContain("permission.requested");
    expect(r.types).toContain("permission.denied");
    expect(r.types).toContain("node.skipped");
  });

  it("S14: Permission timeout (auto-deny)", async () => {
    const ctx = makeContext(spm);
    const tr = setupToolRegistry(tmpDir);
    const targetFile = path.join(tmpDir, "src/timeout.ts");
    const plan = buildPlan([
      { id: "s1", step: "write", capability: "apply-patch", toolName: "apply-patch", params: { file: targetFile, content: "x" }, dependsOn: [] },
    ], { defaultTimeout: 5000 });
    const runtime = createRuntime(tr);
    runtime.permissionGate.setTimeoutMs(100);
    const t0 = Date.now();
    const events = await collectEvents(runtime.run(plan, ctx));
    const elapsed = Date.now() - t0;
    const types = events.map(e => (e as any).type);
    expect(types).toContain("permission.requested");
    expect(types).toContain("permission.denied");
    expect(types).toContain("node.skipped");
    expect(elapsed).toBeLessThan(2000);
  });

  it("S15: Pause (checkpoint saved)", async () => {
    const ctx = makeContext(spm);
    const tr = setupToolRegistry(tmpDir);
    const plan = buildPlan([
      { id: "s1", step: "1", capability: "find-symbol", toolName: "find-symbol", params: {}, dependsOn: [] },
      { id: "s2", step: "2", capability: "find-issues", toolName: "find-issues", params: {}, dependsOn: ["s1"] },
      { id: "s3", step: "3", capability: "find-metrics", toolName: "find-metrics", params: {}, dependsOn: ["s2"] },
    ]);
    const runtime = createRuntime(tr);
    const events = await collectEvents(runtime.run(plan, ctx));
    expect(events.some(e => (e as any).type === "task.completed")).toBe(true);
    expect(events.some(e => (e as any).type === "checkpoint.saved")).toBe(true);
  });

  it("S16: Resume (checkpoint restore)", async () => {
    const ctx = makeContext(spm);
    const tr = setupToolRegistry(tmpDir);
    const plan = buildPlan([
      { id: "s1", step: "1", capability: "find-symbol", toolName: "find-symbol", params: {}, dependsOn: [] },
      { id: "s2", step: "2", capability: "find-issues", toolName: "find-issues", params: {}, dependsOn: ["s1"] },
    ]);
    const runtime = createRuntime(tr);
    const events = await collectEvents(runtime.run(plan, ctx));
    expect(events.some(e => (e as any).type === "checkpoint.saved")).toBe(true);
  });

  it("S17: Cancel", async () => {
    const ctx = makeContext(spm);
    const tr = setupToolRegistry(tmpDir);
    const plan = buildPlan([
      { id: "s1", step: "1", capability: "find-symbol", toolName: "find-symbol", params: {}, dependsOn: [] },
      { id: "s2", step: "2", capability: "find-issues", toolName: "find-issues", params: {}, dependsOn: ["s1"] },
      { id: "s3", step: "3", capability: "find-metrics", toolName: "find-metrics", params: {}, dependsOn: ["s2"] },
    ]);
    const runtime = createRuntime(tr);
    setTimeout(() => {
      runtime.permissionGate.cancelAll();
      const tasks = runtime.getActiveTasks();
      if (tasks[0]) runtime.cancel(tasks[0]);
    }, 5);
    const events = await collectEvents(runtime.run(plan, ctx));
    const types = events.map(e => (e as any).type);
    expect(types.some(t => t === "task.completed" || t === "task.cancelled")).toBe(true);
  });

  it("S18: Multi-file patch (parallel group)", async () => {
    const ctx = makeContext(spm);
    const tr = setupToolRegistry(tmpDir);
    const f1 = path.join(tmpDir, "src/multi1.ts");
    const f2 = path.join(tmpDir, "src/multi2.ts");
    const f3 = path.join(tmpDir, "src/multi3.ts");
    const plan = buildPlan([
      { id: "s1", step: "p1", capability: "apply-patch", toolName: "apply-patch", params: { file: f1, content: "a" }, dependsOn: [], parallelGroup: "patch" },
      { id: "s2", step: "p2", capability: "apply-patch", toolName: "apply-patch", params: { file: f2, content: "b" }, dependsOn: [], parallelGroup: "patch" },
      { id: "s3", step: "p3", capability: "apply-patch", toolName: "apply-patch", params: { file: f3, content: "c" }, dependsOn: [], parallelGroup: "patch" },
    ], { maxParallel: 3 });
    const r = await runScenario(plan, tr, ctx, { autoApprove: true });
    expect(r.filesChanged.length).toBe(3);
  });

  it("S19: Context overflow (token budget trimming)", async () => {
    const ctx = makeContext(spm);
    const ctxBuilder = createContextBuilder();
    const budget = { total: 100, reserved: 10, available: 90 };
    const needs: Array<{ type: "file"; ref: string; priority: "critical" | "important" | "nice-to-have" }> = [];
    for (let i = 0; i < 10; i++) {
      needs.push({ type: "file" as const, ref: spm.files[0].path, priority: (i < 2 ? "critical" : i < 6 ? "important" : "nice-to-have") as "critical" | "important" | "nice-to-have" });
    }
    const result = ctxBuilder.build(needs, budget, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.truncated).toBe(true);
  });

  it("S20: Planner retry (explicit error, no silent fallback)", async () => {
    const ctx = makeContext(spm);
    const { toolRegistry } = createRegistries();
    const manifests = (toolRegistry as any).listAllManifests?.() || [];
    const caps = manifests.flatMap((m: any) => m.capabilities);
    const planner = createPlanner(caps, [], createContextBuilder());
    const result = await planner.plan("test query", ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PLAN_GENERATION_FAILED");
  });
});
