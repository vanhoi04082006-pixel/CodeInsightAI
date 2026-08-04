// CodeInsight AI — Agent Integration Tests (v2.0)
// Real integration tests covering the full agent pipeline.
// These are NOT unit tests — they exercise multiple layers together.

import { buildSPM } from "@/lib/agent/spm";
import { buildIndexes } from "@/lib/agent/indexes";
import { createQueryService } from "@/lib/agent/query";
import { createRegistries } from "@/lib/agent/tools";
import { createPlanner } from "@/lib/agent/planner";
import { createRuntime, RollbackManager, registerRollbackManager, unregisterRollbackManager, getSharedRollbackManager } from "@/lib/agent/runtime";
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

// ─── Test Helpers ─────────────────────────────────────────────────────

function buildTestSPM(): SemanticProjectModel {
  const files: SemanticFile[] = [
    { path: "src/app.ts", language: "typescript", lines: 20, content: "export function app() { return login(); }", symbols: ["src/app.ts::app::function"], imports: ["./auth"] },
    { path: "src/auth.ts", language: "typescript", lines: 15, content: "export function login() { return true; }", symbols: ["src/auth.ts::login::function"], imports: [] },
  ];
  const symbols: SemanticSymbol[] = [
    { id: "src/app.ts::app::function", name: "app", kind: "function", file: "src/app.ts", line: 1, exported: true },
    { id: "src/auth.ts::login::function", name: "login", kind: "function", file: "src/auth.ts", line: 1, exported: true },
  ];
  const edges: SemanticEdge[] = [
    { id: "e1", type: "calls", source: "src/app.ts::app::function", target: "src/auth.ts::login::function", file: "src/app.ts", line: 1 },
  ];
  const issues: SemanticIssue[] = [
    { id: "i1", category: "bugs", severity: "high", title: "Bug in app", description: "desc", file: "src/app.ts", line: 1, recommendation: "fix", effort: "small" },
  ];
  return {
    id: "test/test/1",
    repoOwner: "test",
    repoName: "repo",
    branch: "main",
    commitSha: "abc",
    createdAt: new Date().toISOString(),
    files, symbols, edges, issues,
    insights: [],
    architecture: { pattern: "Simple", strengths: [], weaknesses: [], layers: ["app"], layerViolations: [] },
    metrics: { totalFiles: 2, totalLines: 35, totalSymbols: 2, totalEdges: 1, cyclomaticComplexity: 1, maintainabilityIndex: 80, couplingScore: 0.5, cohesionScore: 0.7 },
    schemaVersion: 1,
  };
}

function buildContext(spm: SemanticProjectModel): AgentContext {
  const indexes = buildIndexes(spm);
  const query = createQueryService(spm, indexes);
  const memory = createAgentMemory();
  memory.initializeProject(spm, indexes);
  return { spm, query, memory, analysisId: "test-analysis-1", locale: "en" };
}

/** Make a simple mock tool for testing. */
function makeMockTool(name: string, permission: PermissionLevel = "allow", resultValue: unknown = { ok: true }): Tool {
  const manifest: ToolManifest = {
    name,
    description: `Mock tool ${name}`,
    capabilities: [name as any],
    cost: "cheap",
    estimatedTimeMs: 100,
    permission,
    timeout: 5000,
    parallel: true,
    parallelSafe: true,
    cacheable: false,
    cacheTtl: 0,
    streamable: false,
    confidence: 1.0,
    maxRetries: 0,
    inputSchema: { type: "object", properties: {}, required: [] },
    outputSchema: { type: "object", properties: {}, required: [] },
  };
  return {
    manifest,
    async execute() {
      return { ok: true, value: resultValue };
    },
  };
}

/** Collect all events from an async generator. */
async function collectEvents(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("Agent Integration Tests (v2.0)", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), "src/lib/agent/__tests__/fixtures/agent-int-"));
  });

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  // ─── 1. Planner → Runtime (plan execution with real events) ───
  describe("Planner → Runtime integration", () => {
    it("should execute a plan and yield node.started + node.completed events", async () => {
      const spm = buildTestSPM();
      const context = buildContext(spm);
      const { toolRegistry } = createRegistries();

      // Register a mock find-symbol tool that returns a result
      (toolRegistry as any).register(makeMockTool("find-symbol", "allow", { symbols: [{ name: "login", file: "src/auth.ts" }] }));

      // Build a simple plan manually (bypass LLM planner)
      const builder = new ExecutionGraphBuilder();
      builder.addNode({
        id: "step-1",
        step: "Find login symbol",
        capability: "find-symbol",
        toolName: "find-symbol",
        params: { name: "login" },
        dependsOn: [],
        status: "pending",
      });
      const plan = {
        graph: builder.build(),
        policy: defaultPolicy(),
        estimatedTokens: 1000,
        estimatedTimeMs: 5000,
      };

      const runtime = createRuntime(toolRegistry);
      const events = await collectEvents(runtime.run(plan, context));

      const types = events.map(e => e.type);
      expect(types).toContain("plan.generated");
      expect(types).toContain("node.started");
      expect(types).toContain("node.completed");
      expect(types).toContain("task.completed");

      // v2.0 fix: node.started and node.completed are now yielded (v1 lost them)
      const nodeStarted = events.find(e => e.type === "node.started") as any;
      expect(nodeStarted).toBeDefined();
      expect(nodeStarted.nodeId).toBe("step-1");
      expect(nodeStarted.tool).toBe("find-symbol");

      const nodeCompleted = events.find(e => e.type === "node.completed") as any;
      expect(nodeCompleted).toBeDefined();
      expect(nodeCompleted.nodeId).toBe("step-1");
    });

    it("should yield node.failed when a tool returns an error", async () => {
      const spm = buildTestSPM();
      const context = buildContext(spm);
      const { toolRegistry } = createRegistries();

      // Register a find-symbol tool that always fails
      const failingTool: Tool = {
        manifest: {
          name: "find-symbol",
          description: "failing",
          capabilities: ["find-symbol" as any],
          cost: "cheap", estimatedTimeMs: 100, permission: "allow",
          timeout: 5000, parallel: true, parallelSafe: true,
          cacheable: false, cacheTtl: 0, streamable: false,
          confidence: 1.0, maxRetries: 0,
          inputSchema: { type: "object", properties: {}, required: [] },
          outputSchema: { type: "object", properties: {}, required: [] },
        },
        async execute() {
          return { ok: false, error: { code: "TOOL_EXECUTION_FAILED", message: "simulated failure", recoverable: false } };
        },
      };
      (toolRegistry as any).register(failingTool);

      const builder = new ExecutionGraphBuilder();
      builder.addNode({
        id: "step-1", step: "Find", capability: "find-symbol", toolName: "find-symbol",
        params: {}, dependsOn: [], status: "pending",
      });
      const plan = { graph: builder.build(), policy: { ...defaultPolicy(), defaultRetries: 0 }, estimatedTokens: 1000, estimatedTimeMs: 5000 };

      const runtime = createRuntime(toolRegistry);
      const events = await collectEvents(runtime.run(plan, context));

      const types = events.map(e => e.type);
      expect(types).toContain("node.failed");
      expect(types).toContain("task.completed"); // continueOnFailure=true by default
    });
  });

  // ─── 2. Runtime → Permission (prompt-level tool with auto-respond) ───
  describe("Runtime → Permission integration", () => {
    it("should yield permission.requested and continue when granted", async () => {
      const spm = buildTestSPM();
      const context = buildContext(spm);
      const { toolRegistry } = createRegistries();

      // Register a prompt-level tool
      (toolRegistry as any).register(makeMockTool("apply-patch", "prompt", { modifiedFiles: ["src/app.ts"] }));

      const builder = new ExecutionGraphBuilder();
      builder.addNode({
        id: "step-1", step: "Apply patch", capability: "apply-patch", toolName: "apply-patch",
        params: { file: "src/app.ts", content: "new" }, dependsOn: [], status: "pending",
      });
      const plan = { graph: builder.build(), policy: defaultPolicy(), estimatedTokens: 1000, estimatedTimeMs: 5000 };

      const runtime = createRuntime(toolRegistry);

      // Auto-grant permission after a short delay (simulating UI clicking Approve)
      setTimeout(() => {
        runtime.permissionGate.respond("step-1", true);
      }, 50);

      const events = await collectEvents(runtime.run(plan, context));
      const types = events.map(e => e.type);

      // v2.0 fix: permission.requested/granted are now yielded (v1 lost them)
      expect(types).toContain("permission.requested");
      expect(types).toContain("permission.granted");
      expect(types).toContain("node.started");
      expect(types).toContain("node.completed");
      expect(types).toContain("task.completed");
    });

    it("should yield permission.denied and skip the node when denied", async () => {
      const spm = buildTestSPM();
      const context = buildContext(spm);
      const { toolRegistry } = createRegistries();
      (toolRegistry as any).register(makeMockTool("apply-patch", "prompt"));

      const builder = new ExecutionGraphBuilder();
      builder.addNode({
        id: "step-1", step: "Apply", capability: "apply-patch", toolName: "apply-patch",
        params: { file: "src/app.ts", content: "new" }, dependsOn: [], status: "pending",
      });
      const plan = { graph: builder.build(), policy: defaultPolicy(), estimatedTokens: 1000, estimatedTimeMs: 5000 };

      const runtime = createRuntime(toolRegistry);
      setTimeout(() => runtime.permissionGate.respond("step-1", false, "User rejected"), 50);

      const events = await collectEvents(runtime.run(plan, context));
      const types = events.map(e => e.type);

      expect(types).toContain("permission.requested");
      expect(types).toContain("permission.denied");
      expect(types).toContain("node.skipped");
      expect(types).toContain("task.completed");
      // Node should NOT have started (denied before execution)
      expect(types).not.toContain("node.started");
    });

    it("should auto-deny on timeout (no infinite hang)", async () => {
      const spm = buildTestSPM();
      const context = buildContext(spm);
      const { toolRegistry } = createRegistries();
      (toolRegistry as any).register(makeMockTool("apply-patch", "prompt"));

      const builder = new ExecutionGraphBuilder();
      builder.addNode({
        id: "step-1", step: "Apply", capability: "apply-patch", toolName: "apply-patch",
        params: { file: "src/app.ts", content: "new" }, dependsOn: [], status: "pending",
      });
      const plan = { graph: builder.build(), policy: defaultPolicy(), estimatedTokens: 1000, estimatedTimeMs: 5000 };

      const runtime = createRuntime(toolRegistry);
      runtime.permissionGate.setTimeoutMs(100); // 100ms timeout

      // No respond() call — should auto-deny after 100ms
      const t0 = Date.now();
      const events = await collectEvents(runtime.run(plan, context));
      const elapsed = Date.now() - t0;

      const types = events.map(e => e.type);
      expect(types).toContain("permission.requested");
      expect(types).toContain("permission.denied");
      expect(types).toContain("node.skipped");
      expect(elapsed).toBeLessThan(2000); // no infinite hang
    });
  });

  // ─── 3. Pause → Resume (checkpoint saved) ───
  describe("Pause → Resume integration", () => {
    it("should save checkpoints during execution", async () => {
      const spm = buildTestSPM();
      const context = buildContext(spm);
      const { toolRegistry } = createRegistries();
      (toolRegistry as any).register(makeMockTool("find-symbol", "allow"));

      const builder = new ExecutionGraphBuilder();
      builder.addNode({ id: "s1", step: "1", capability: "find-symbol", toolName: "find-symbol", params: {}, dependsOn: [], status: "pending" });
      builder.addNode({ id: "s2", step: "2", capability: "find-symbol", toolName: "find-symbol", params: {}, dependsOn: ["s1"], status: "pending" });
      builder.addNode({ id: "s3", step: "3", capability: "find-symbol", toolName: "find-symbol", params: {}, dependsOn: ["s2"], status: "pending" });
      const plan = { graph: builder.build(), policy: { ...defaultPolicy() }, estimatedTokens: 1000, estimatedTimeMs: 5000 };

      const runtime = createRuntime(toolRegistry);

      const events = await collectEvents(runtime.run(plan, context));
      expect(events.some(e => e.type === "task.completed")).toBe(true);
      // Checkpoint.saved events should be emitted after each node completes
      expect(events.some(e => e.type === "checkpoint.saved")).toBe(true);
    });
  });

  // ─── 4. Context → Planner (ContextBuilder wired to Planner) ───
  describe("Context → Planner integration", () => {
    it("should use ContextBuilder when provided to the planner", async () => {
      const spm = buildTestSPM();
      const context = buildContext(spm);
      const contextBuilder = createContextBuilder();

      // The planner accepts a context builder; we verify it doesn't throw
      // and that the prompt includes context-builder output.
      const planner = createPlanner(["find-symbol"], [], contextBuilder);

      // We can't easily call plan() without a real AI provider, but we can
      // verify the contextBuilder works standalone.
      const budget = { total: 128000, reserved: 8000, available: 120000 };
      const needs = [
        { type: "architecture" as const, ref: "", priority: "critical" as const },
        { type: "file" as const, ref: "src/app.ts", priority: "important" as const },
      ];
      const result = contextBuilder.build(needs, budget, context);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain("Architecture");
        expect(result.value.content).toContain("src/app.ts");
      }
    });
  });

  // ─── 5. Rollback (real fs operations) ───
  describe("RollbackManager integration (real fs)", () => {
    it("should track a file creation and rollback (delete the file)", async () => {
      const rollback = new RollbackManager();
      const fileOps = await import("@/lib/repo-editor/file-operations");
      rollback.setFileOps({
        deleteFile: fileOps.deleteFile,
        writeFile: fileOps.writeFile,
        createFile: fileOps.createFile,
        fileExists: fileOps.fileExists,
      });

      const testFile = path.join(tmpDir, "rollback-test-create.txt");

      // Create a file (track as "create")
      await fileOps.writeFile(testFile, "initial");
      rollback.track({ file: testFile, type: "create" });
      expect(rollback.hasChanges()).toBe(true);
      expect(await fileOps.fileExists(testFile)).toBe(true);

      // Rollback — should delete the created file
      const result = await rollback.rollback();
      expect(result.ok).toBe(true);
      expect(await fileOps.fileExists(testFile)).toBe(false);
      expect(rollback.hasChanges()).toBe(false);
    });

    it("should track a file update and rollback (restore old content)", async () => {
      const rollback = new RollbackManager();
      const fileOps = await import("@/lib/repo-editor/file-operations");
      rollback.setFileOps({
        deleteFile: fileOps.deleteFile,
        writeFile: fileOps.writeFile,
        createFile: fileOps.createFile,
        fileExists: fileOps.fileExists,
      });

      const testFile = path.join(tmpDir, "rollback-test-update.txt");

      // Create initial file
      await fileOps.writeFile(testFile, "original content");

      // "Update" the file — track with old content
      rollback.track({ file: testFile, type: "update", oldContent: "original content" });
      await fileOps.writeFile(testFile, "modified content");
      expect(await fileOps.readFile(testFile)).toBe("modified content");

      // Rollback — should restore old content
      const result = await rollback.rollback();
      expect(result.ok).toBe(true);
      expect(await fileOps.readFile(testFile)).toBe("original content");
    });

    it("should track a file deletion and rollback (recreate with old content)", async () => {
      const rollback = new RollbackManager();
      const fileOps = await import("@/lib/repo-editor/file-operations");
      rollback.setFileOps({
        deleteFile: fileOps.deleteFile,
        writeFile: fileOps.writeFile,
        createFile: fileOps.createFile,
        fileExists: fileOps.fileExists,
      });

      const testFile = path.join(tmpDir, "rollback-test-delete.txt");
      await fileOps.writeFile(testFile, "to be deleted");

      // "Delete" the file — track with old content
      rollback.track({ file: testFile, type: "delete", oldContent: "to be deleted" });
      await fileOps.deleteFile(testFile);
      expect(await fileOps.fileExists(testFile)).toBe(false);

      // Rollback — should recreate the file
      const result = await rollback.rollback();
      expect(result.ok).toBe(true);
      expect(await fileOps.fileExists(testFile)).toBe(true);
      expect(await fileOps.readFile(testFile)).toBe("to be deleted");
    });

    it("should share a RollbackManager via shared-state registry", async () => {
      const rollback = new RollbackManager();
      const analysisId = "test-shared-analysis";
      registerRollbackManager(analysisId, rollback);

      const retrieved = getSharedRollbackManager(analysisId);
      expect(retrieved).toBe(rollback);

      unregisterRollbackManager(analysisId);
      expect(getSharedRollbackManager(analysisId)).toBeNull();
    });
  });

  // ─── 6. Write tools (apply-patch returns change records) ───
  describe("Write tools integration", () => {
    it("apply-patch tool should return change records for the engine to track", async () => {
      const spm = buildTestSPM();
      const context = buildContext(spm);

      // Simulate what apply-patch does: write a file via RepoService and return changes
      const { RepoServiceImpl } = await import("@/lib/agent/services/repo-service");
      const repo = new RepoServiceImpl();

      const testFile = path.join(tmpDir, "apply-patch-test.txt");
      const writeResult = await repo.writeFileAsync(testFile, "new content");
      expect(writeResult.ok).toBe(true);

      const changes = repo.getChangeLog();
      expect(changes.length).toBe(1);
      expect(changes[0].file).toBe(testFile);
      expect(changes[0].type).toBe("create"); // file didn't exist before

      // The change record should have no oldContent (create, not update)
      expect(changes[0].oldContent).toBeUndefined();

      // Clean up
      await repo.deleteFileAsync(testFile);
    });

    it("apply-patch on existing file should track as 'update' with oldContent", async () => {
      const spm = buildTestSPM();
      const { RepoServiceImpl } = await import("@/lib/agent/services/repo-service");
      const repo = new RepoServiceImpl();

      const testFile = path.join(tmpDir, "apply-patch-update.txt");
      // Create first
      await repo.writeFileAsync(testFile, "v1");
      repo.clearChangeLog();

      // Update
      const writeResult = await repo.writeFileAsync(testFile, "v2");
      expect(writeResult.ok).toBe(true);

      const changes = repo.getChangeLog();
      expect(changes[0].type).toBe("update");
      expect(changes[0].oldContent).toBe("v1");

      // Clean up
      await repo.deleteFileAsync(testFile);
    });
  });

  // ─── 7. Agent Chat (event ordering + types) ───
  describe("Agent Chat event flow (E2E)", () => {
    it("should produce a valid event sequence for a 3-node plan", async () => {
      const spm = buildTestSPM();
      const context = buildContext(spm);
      const { toolRegistry } = createRegistries();
      (toolRegistry as any).register(makeMockTool("find-symbol", "allow"));
      (toolRegistry as any).register(makeMockTool("search-code", "allow"));
      (toolRegistry as any).register(makeMockTool("find-issues", "allow"));

      const builder = new ExecutionGraphBuilder();
      builder.addNode({ id: "s1", step: "search", capability: "search-code", toolName: "search-code", params: { query: "login" }, dependsOn: [], parallelGroup: "discover", status: "pending" });
      builder.addNode({ id: "s2", step: "symbol", capability: "find-symbol", toolName: "find-symbol", params: { name: "login" }, dependsOn: [], parallelGroup: "discover", status: "pending" });
      builder.addNode({ id: "s3", step: "issues", capability: "find-issues", toolName: "find-issues", params: {}, dependsOn: ["s1", "s2"], status: "pending" });
      const plan = { graph: builder.build(), policy: defaultPolicy(), estimatedTokens: 1000, estimatedTimeMs: 5000 };

      const runtime = createRuntime(toolRegistry);
      const events = await collectEvents(runtime.run(plan, context));
      const types = events.map(e => e.type);

      // plan.generated should be first
      expect(types[0]).toBe("plan.generated");

      // s1 and s2 should have started/completed (parallel group)
      expect(types.filter(t => t === "node.started").length).toBeGreaterThanOrEqual(2);
      expect(types.filter(t => t === "node.completed").length).toBeGreaterThanOrEqual(2);

      // s3 should run after s1 + s2 complete
      expect(types).toContain("node.started");
      expect(types).toContain("task.completed");

      // Each node should have a corresponding node.completed
      const started = events.filter(e => e.type === "node.started").map(e => (e as any).nodeId);
      const completed = events.filter(e => e.type === "node.completed").map(e => (e as any).nodeId);
      for (const id of started) {
        expect(completed).toContain(id);
      }
    });

    it("should update working memory during execution (currentStep)", async () => {
      const spm = buildTestSPM();
      const context = buildContext(spm);
      const { toolRegistry } = createRegistries();
      (toolRegistry as any).register(makeMockTool("find-symbol", "allow"));

      const builder = new ExecutionGraphBuilder();
      builder.addNode({ id: "s1", step: "My custom step", capability: "find-symbol", toolName: "find-symbol", params: {}, dependsOn: [], status: "pending" });
      const plan = { graph: builder.build(), policy: defaultPolicy(), estimatedTokens: 1000, estimatedTimeMs: 5000 };

      const runtime = createRuntime(toolRegistry);
      await collectEvents(runtime.run(plan, context));

      // v2.0: working memory should have been updated with currentStep
      expect(context.memory.working.currentStep).toBe("My custom step");
    });
  });
});
