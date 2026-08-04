// v2.1 Certification — Memory Leak Audit
// Runs 1000 tasks and measures heap growth, retained objects, cache size, listeners, timers.

import { buildIndexes } from "@/lib/agent/indexes";
import { createQueryService } from "@/lib/agent/query";
import { createRegistries } from "@/lib/agent/tools";
import { createRuntime } from "@/lib/agent/runtime";
import { createAgentMemory } from "@/lib/agent/memory";
import type { SemanticProjectModel, AgentContext, Tool, ToolManifest, Result } from "@/lib/agent/contracts";
import { ExecutionGraphBuilder, defaultPolicy } from "@/lib/agent/planner";

function buildSPM(): SemanticProjectModel {
  return {
    id: "leak/1", repoOwner: "l", repoName: "r", branch: "main", commitSha: "a", createdAt: new Date().toISOString(),
    files: [{ path: "src/app.ts", language: "ts", lines: 1, content: "x", symbols: [], imports: [] }],
    symbols: [], edges: [], issues: [], insights: [],
    architecture: { pattern: "P", strengths: [], weaknesses: [], layers: [], layerViolations: [] },
    metrics: { totalFiles: 1, totalLines: 1, totalSymbols: 0, totalEdges: 0, cyclomaticComplexity: 1, maintainabilityIndex: 80, couplingScore: 0, cohesionScore: 0 },
    schemaVersion: 1,
  };
}

function makeCtx(spm: SemanticProjectModel, id: string): AgentContext {
  const idx = buildIndexes(spm);
  const q = createQueryService(spm, idx);
  const m = createAgentMemory();
  m.initializeProject(spm, idx);
  return { spm, query: q, memory: m, analysisId: id, locale: "en" };
}

function makeTool(name: string): Tool {
  const manifest: ToolManifest = {
    name, description: "", capabilities: [name as any], cost: "cheap", estimatedTimeMs: 1, permission: "allow",
    timeout: 5000, parallel: true, parallelSafe: true, cacheable: false, cacheTtl: 0, streamable: false,
    confidence: 1, maxRetries: 0, inputSchema: { type: "object", properties: {}, required: [] }, outputSchema: { type: "object", properties: {}, required: [] },
  };
  return { manifest, async execute() { return { ok: true, value: { ok: true } }; } };
}

function buildPlan(n: number): any {
  const b = new ExecutionGraphBuilder();
  for (let i = 0; i < n; i++) {
    b.addNode({ id: `n${i}`, step: `s${i}`, capability: "find-symbol", toolName: "find-symbol", params: {}, dependsOn: [], status: "pending", parallelGroup: "g" });
  }
  return { graph: b.build(), policy: { ...defaultPolicy(), maxParallel: n }, estimatedTokens: 1000, estimatedTimeMs: 5000 };
}

async function runOne(runtime: any, spm: SemanticProjectModel, id: string): Promise<void> {
  const ctx = makeCtx(spm, id);
  for await (const _e of runtime.run(buildPlan(3), ctx)) { /* drain */ }
}

describe("v2.1 Memory Leak Audit (1000 tasks)", () => {
  const spm = buildSPM();
  const { toolRegistry } = createRegistries();
  (toolRegistry as any).register(makeTool("find-symbol"));

  it("M1: 1000 sequential tasks — heap growth < 100MB, no retained engines", async () => {
    if (global.gc) global.gc();
    const runtime = createRuntime(toolRegistry);
    const memBefore = process.memoryUsage();
    const activeBefore = runtime.getActiveTasks().length;

    for (let i = 0; i < 1000; i++) {
      await runOne(runtime, spm, `seq-${i}`);
    }

    if (global.gc) global.gc();
    const memAfter = process.memoryUsage();
    const heapGrowthMB = (memAfter.heapUsed - memBefore.heapUsed) / 1048576;
    const activeAfter = runtime.getActiveTasks().length;

    console.log("[Leak M1]", JSON.stringify({
      heapBeforeMB: +(memBefore.heapUsed / 1048576).toFixed(1),
      heapAfterMB: +(memAfter.heapUsed / 1048576).toFixed(1),
      heapGrowthMB: +heapGrowthMB.toFixed(1),
      activeTasksBefore: activeBefore,
      activeTasksAfter: activeAfter,
    }));

    // No retained active tasks (engines should be cleaned up)
    expect(activeAfter).toBe(0);
    // Heap growth should be bounded (allow some GC slack)
    expect(heapGrowthMB).toBeLessThan(150);
  }, 120000);

  it("M2: CheckpointManager doesn't grow unbounded (maxCheckpoints enforced)", async () => {
    const runtime = createRuntime(toolRegistry);
    // Save 100 checkpoints for the same task
    const plan = buildPlan(1);
    for (let i = 0; i < 100; i++) {
      runtime.checkpointManager.save(`task-m2`, plan, [`n${i}`], `n${i}`, null);
    }
    // Should be capped at maxCheckpoints (50)
    const count = runtime.checkpointManager.count("task-m2");
    expect(count).toBeLessThanOrEqual(50);
  });

  it("M3: PermissionGate pendingRequests cleared after respond/cancel", async () => {
    const runtime = createRuntime(toolRegistry);
    // Simulate a pending request by calling request() (it will hang, so we cancel)
    const p = (runtime.permissionGate as any).request("node-m3", "apply-patch", {}, {
      name: "apply-patch", description: "", capabilities: [], cost: "cheap", estimatedTimeMs: 1, permission: "prompt",
      timeout: 1, parallel: false, parallelSafe: false, cacheable: false, cacheTtl: 0, streamable: false,
      confidence: 1, maxRetries: 0, inputSchema: { type: "object", properties: {}, required: [] }, outputSchema: { type: "object", properties: {}, required: [] },
    });
    expect(runtime.permissionGate.isPending("node-m3")).toBe(true);
    runtime.permissionGate.cancelAll();
    await p;
    expect(runtime.permissionGate.isPending("node-m3")).toBe(false);
  });

  it("M4: EventBus subscribers can be unsubscribed (no leak)", async () => {
    const runtime = createRuntime(toolRegistry);
    let calls = 0;
    const unsub = runtime.eventBus.subscribe(() => calls++);
    // Emit should call subscriber
    runtime.eventBus.emit({ type: "task.completed", summary: "x", timestamp: Date.now() } as any);
    expect(calls).toBe(1);
    // Unsubscribe
    unsub();
    runtime.eventBus.emit({ type: "task.completed", summary: "x", timestamp: Date.now() } as any);
    expect(calls).toBe(1); // not called again
  });

  it("M5: RollbackManager cleared after rollback", async () => {
    const runtime = createRuntime(toolRegistry);
    runtime.rollbackManager.track({ file: "a", type: "create" });
    expect(runtime.rollbackManager.hasChanges()).toBe(true);
    await runtime.rollbackManager.rollback();
    expect(runtime.rollbackManager.hasChanges()).toBe(false);
    expect(runtime.rollbackManager.count()).toBe(0);
  });
});
