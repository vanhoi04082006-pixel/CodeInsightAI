// v2.1 Certification — Stress Test: 10/50/100 concurrent tasks
// Measures latency, throughput, memory, CPU, event delay under concurrent load.

import { buildIndexes } from "@/lib/agent/indexes";
import { createQueryService } from "@/lib/agent/query";
import { createRegistries } from "@/lib/agent/tools";
import { createRuntime } from "@/lib/agent/runtime";
import { createAgentMemory } from "@/lib/agent/memory";
import type { SemanticProjectModel, AgentContext, AgentEvent, Tool, ToolManifest } from "@/lib/agent/contracts";
import { ExecutionGraphBuilder, defaultPolicy } from "@/lib/agent/planner";

function buildSPM(): SemanticProjectModel {
  const f = "src/app.ts";
  return {
    id: "stress/1", repoOwner: "s", repoName: "r", branch: "main", commitSha: "a", createdAt: new Date().toISOString(),
    files: [{ path: f, language: "ts", lines: 10, content: "x", symbols: [], imports: [] }],
    symbols: [], edges: [], issues: [], insights: [],
    architecture: { pattern: "P", strengths: [], weaknesses: [], layers: [], layerViolations: [] },
    metrics: { totalFiles: 1, totalLines: 10, totalSymbols: 0, totalEdges: 0, cyclomaticComplexity: 1, maintainabilityIndex: 80, couplingScore: 0.5, cohesionScore: 0.7 },
    schemaVersion: 1,
  };
}

function makeTool(name: string): Tool {
  const manifest: ToolManifest = {
    name, description: "", capabilities: [name as any], cost: "cheap", estimatedTimeMs: 10, permission: "allow",
    timeout: 5000, parallel: true, parallelSafe: true, cacheable: false, cacheTtl: 0, streamable: false,
    confidence: 1, maxRetries: 0, inputSchema: { type: "object", properties: {}, required: [] }, outputSchema: { type: "object", properties: {}, required: [] },
  };
  return { manifest, async execute() { return { ok: true, value: { ok: true } }; } };
}

function makeContext(spm: SemanticProjectModel): AgentContext {
  const idx = buildIndexes(spm);
  const q = createQueryService(spm, idx);
  const m = createAgentMemory();
  m.initializeProject(spm, idx);
  return { spm, query: q, memory: m, analysisId: `stress-${Date.now()}-${Math.random()}`, locale: "en" };
}

function buildPlan(nodeCount: number): any {
  const b = new ExecutionGraphBuilder();
  for (let i = 0; i < nodeCount; i++) {
    b.addNode({ id: `n${i}`, step: `step${i}`, capability: "find-symbol" as any, toolName: "find-symbol", params: {}, dependsOn: i > 0 ? [`n${i-1}`] : [], status: "pending" });
  }
  return { graph: b.build(), policy: defaultPolicy(), estimatedTokens: 1000, estimatedTimeMs: 5000 };
}

async function runOneTask(toolRegistry: any, spm: SemanticProjectModel, nodeCount: number): Promise<{ durationMs: number; eventCount: number; firstEventDelayMs: number; outcome: string }> {
  const ctx = makeContext(spm);
  const runtime = createRuntime(toolRegistry);
  const plan = buildPlan(nodeCount);
  const t0 = performance.now();
  let firstEventAt = 0;
  let eventCount = 0;
  let outcome = "unknown";
  for await (const e of runtime.run(plan, ctx)) {
    eventCount++;
    if (eventCount === 1) firstEventAt = performance.now() - t0;
    const ev = e as any;
    if (ev.type === "task.completed") outcome = ev.summary;
    if (ev.type === "task.failed") outcome = `failed`;
  }
  return { durationMs: performance.now() - t0, eventCount, firstEventDelayMs: firstEventAt, outcome };
}

async function runConcurrent(n: number, toolRegistry: any, spm: SemanticProjectModel, nodeCount: number) {
  const memBefore = process.memoryUsage();
  const t0 = performance.now();
  const promises = Array.from({ length: n }, () => runOneTask(toolRegistry, spm, nodeCount));
  const results = await Promise.all(promises);
  const totalMs = performance.now() - t0;
  const memAfter = process.memoryUsage();
  const durations = results.map(r => r.durationMs);
  const firstDelays = results.map(r => r.firstEventDelayMs);
  return {
    n,
    totalMs,
    throughput: (n / totalMs) * 1000, // tasks/sec
    avgDuration: durations.reduce((a, b) => a + b, 0) / n,
    maxDuration: Math.max(...durations),
    minDuration: Math.min(...durations),
    avgFirstEventDelay: firstDelays.reduce((a, b) => a + b, 0) / n,
    maxFirstEventDelay: Math.max(...firstDelays),
    allCompleted: results.every(r => r.outcome.startsWith("Completed")),
    heapDeltaMB: +((memAfter.heapUsed - memBefore.heapUsed) / 1048576).toFixed(1),
    rssMB: +(memAfter.rss / 1048576).toFixed(1),
  };
}

describe("v2.1 Stress Test — concurrent tasks", () => {
  const spm = buildSPM();
  const { toolRegistry } = createRegistries();
  (toolRegistry as any).register(makeTool("find-symbol"));

  it("10 concurrent tasks (3 nodes each)", async () => {
    const r = await runConcurrent(10, toolRegistry, spm, 3);
    console.log("[Stress 10]", JSON.stringify(r));
    expect(r.allCompleted).toBe(true);
    expect(r.throughput).toBeGreaterThan(1); // at least 1 task/sec
    expect(r.maxFirstEventDelay).toBeLessThan(5000); // first event within 5s
  }, 30000);

  it("50 concurrent tasks (3 nodes each)", async () => {
    const r = await runConcurrent(50, toolRegistry, spm, 3);
    console.log("[Stress 50]", JSON.stringify(r));
    expect(r.allCompleted).toBe(true);
    expect(r.throughput).toBeGreaterThan(1);
    expect(r.maxFirstEventDelay).toBeLessThan(10000);
  }, 60000);

  it("100 concurrent tasks (3 nodes each)", async () => {
    const r = await runConcurrent(100, toolRegistry, spm, 3);
    console.log("[Stress 100]", JSON.stringify(r));
    expect(r.allCompleted).toBe(true);
    expect(r.throughput).toBeGreaterThan(0.5); // at least 0.5 task/sec under heavy load
    expect(r.maxFirstEventDelay).toBeLessThan(15000);
    // Memory should not explode (each task holds SPM ref — but SPM is shared)
    expect(r.heapDeltaMB).toBeLessThan(500);
  }, 120000);
});
