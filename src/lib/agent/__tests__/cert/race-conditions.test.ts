// v2.1 Certification — Race Condition Audit
// Audits shared memory, permission queue, checkpoint, rollback, event bus, concurrent runtime.

import { buildIndexes } from "@/lib/agent/indexes";
import { createQueryService } from "@/lib/agent/query";
import { createRegistries } from "@/lib/agent/tools";
import { createRuntime, EventBusImpl, createEventBus, RollbackManager } from "@/lib/agent/runtime";
import { createAgentMemory } from "@/lib/agent/memory";
import type { SemanticProjectModel, AgentContext, AgentEvent, Tool, ToolManifest, Result } from "@/lib/agent/contracts";
import { ExecutionGraphBuilder, defaultPolicy } from "@/lib/agent/planner";

function buildSPM(): SemanticProjectModel {
  return {
    id: "race/1", repoOwner: "r", repoName: "r", branch: "main", commitSha: "a", createdAt: new Date().toISOString(),
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

function makeTool(name: string, exec?: () => Promise<Result<unknown>>): Tool {
  const manifest: ToolManifest = {
    name, description: "", capabilities: [name as any], cost: "cheap", estimatedTimeMs: 10, permission: "allow",
    timeout: 5000, parallel: true, parallelSafe: true, cacheable: false, cacheTtl: 0, streamable: false,
    confidence: 1, maxRetries: 0, inputSchema: { type: "object", properties: {}, required: [] }, outputSchema: { type: "object", properties: {}, required: [] },
  };
  return { manifest, execute: async () => exec ? exec() : { ok: true, value: {} } };
}

function buildPlan(n: number): any {
  const b = new ExecutionGraphBuilder();
  for (let i = 0; i < n; i++) {
    b.addNode({ id: `n${i}`, step: `s${i}`, capability: "find-symbol", toolName: "find-symbol", params: {}, dependsOn: [], status: "pending", parallelGroup: "g" });
  }
  return { graph: b.build(), policy: { ...defaultPolicy(), maxParallel: n }, estimatedTokens: 1000, estimatedTimeMs: 5000 };
}

async function collect(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("v2.1 Race Condition Audit", () => {
  const spm = buildSPM();

  it("R1: Parallel nodes in same group don't corrupt shared working memory", async () => {
    const ctx = makeCtx(spm, "r1");
    const { toolRegistry } = createRegistries();
    let counter = 0;
    (toolRegistry as any).register(makeTool("find-symbol", async () => {
      counter++;
      await new Promise(r => setTimeout(r, 10));
      return { ok: true, value: { count: counter } };
    }));
    const plan = buildPlan(5);
    const runtime = createRuntime(toolRegistry);
    const events = await collect(runtime.run(plan, ctx));
    // All 5 nodes should have executed (counter incremented 5 times)
    expect(counter).toBe(5);
    expect(events.some(e => (e as any).type === "task.completed")).toBe(true);
  });

  it("R2: PermissionGate respond() for non-pending nodeId is a safe no-op", async () => {
    const { toolRegistry } = createRegistries();
    (toolRegistry as any).register(makeTool("find-symbol"));
    const runtime = createRuntime(toolRegistry);
    // Respond to a node that isn't pending — should not throw
    expect(() => runtime.permissionGate.respond("nonexistent", true)).not.toThrow();
    expect(() => runtime.permissionGate.respond("nonexistent", false, "reason")).not.toThrow();
  });

  it("R3: cancelAll() on empty gate is safe", async () => {
    const runtime = createRuntime({ get: () => null } as any);
    expect(() => runtime.permissionGate.cancelAll()).not.toThrow();
  });

  it("R4: EventBus subscriber throwing doesn't crash emit", async () => {
    const bus = createEventBus();
    let called = false;
    bus.subscribe(() => { called = true; throw new Error("subscriber crash"); });
    let secondCalled = false;
    bus.subscribe(() => { secondCalled = true; });
    // Emit should not throw, and the second subscriber should still be called
    expect(() => {
      bus.emit({ type: "task.completed", summary: "x", timestamp: Date.now() } as any);
    }).not.toThrow();
    expect(called).toBe(true);
    expect(secondCalled).toBe(true);
  });

  it("R5: Concurrent runtimes don't share permission gate state", async () => {
    const { toolRegistry } = createRegistries();
    (toolRegistry as any).register(makeTool("find-symbol"));
    const r1 = createRuntime(toolRegistry);
    const r2 = createRuntime(toolRegistry);
    // They should have independent permission gates
    expect(r1.permissionGate).not.toBe(r2.permissionGate);
    expect(r1.permissionGate.isPending("x")).toBe(false);
    expect(r2.permissionGate.isPending("x")).toBe(false);
  });

  it("R6: RollbackManager is per-runtime (not shared)", async () => {
    const { toolRegistry } = createRegistries();
    const r1 = createRuntime(toolRegistry);
    const r2 = createRuntime(toolRegistry);
    expect(r1.rollbackManager).not.toBe(r2.rollbackManager);
    r1.rollbackManager.track({ file: "a", type: "create" });
    expect(r1.rollbackManager.hasChanges()).toBe(true);
    expect(r2.rollbackManager.hasChanges()).toBe(false);
  });

  it("R7: CheckpointManager is per-runtime", async () => {
    const { toolRegistry } = createRegistries();
    const r1 = createRuntime(toolRegistry);
    const r2 = createRuntime(toolRegistry);
    expect(r1.checkpointManager).not.toBe(r2.checkpointManager);
  });

  it("R8: Two concurrent tasks on same runtime don't collide (separate engines)", async () => {
    const ctx1 = makeCtx(spm, "r8a");
    const ctx2 = makeCtx(spm, "r8b");
    const { toolRegistry } = createRegistries();
    (toolRegistry as any).register(makeTool("find-symbol"));
    const runtime = createRuntime(toolRegistry);
    const plan = buildPlan(2);
    const [e1, e2] = await Promise.all([
      collect(runtime.run(plan, ctx1)),
      collect(runtime.run(plan, ctx2)),
    ]);
    expect(e1.some(e => (e as any).type === "task.completed")).toBe(true);
    expect(e2.some(e => (e as any).type === "task.completed")).toBe(true);
  });

  it("R9: shared-state registry is per-analysisId (no cross-contamination)", async () => {
    const { registerRollbackManager, unregisterRollbackManager, getSharedRollbackManager } = await import("@/lib/agent/runtime/shared-state");
    const rb1 = new RollbackManager();
    const rb2 = new RollbackManager();
    registerRollbackManager("analysis-A", rb1);
    registerRollbackManager("analysis-B", rb2);
    expect(getSharedRollbackManager("analysis-A")).toBe(rb1);
    expect(getSharedRollbackManager("analysis-B")).toBe(rb2);
    expect(getSharedRollbackManager("analysis-A")).not.toBe(rb2);
    unregisterRollbackManager("analysis-A");
    unregisterRollbackManager("analysis-B");
  });

  it("R10: EventBus is per-runtime (events don't leak across runtimes)", async () => {
    const { toolRegistry } = createRegistries();
    (toolRegistry as any).register(makeTool("find-symbol"));
    const r1 = createRuntime(toolRegistry);
    const r2 = createRuntime(toolRegistry);
    let r1Events = 0;
    let r2Events = 0;
    r1.eventBus.subscribe(() => r1Events++);
    r2.eventBus.subscribe(() => r2Events++);
    // Run a task on r1 — r2's bus should not see events
    await collect(r1.run(buildPlan(1), makeCtx(spm, "r10")));
    expect(r1Events).toBeGreaterThan(0);
    expect(r2Events).toBe(0);
  });
});
