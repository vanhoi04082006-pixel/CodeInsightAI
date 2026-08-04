// CodeInsight AI — Runtime Tests (Layer 7)

import { describe, it, expect, beforeEach } from "@jest/globals";
import { EventBusImpl, makeEvent } from "@/lib/agent/runtime/event-bus";
import { PermissionGateImpl } from "@/lib/agent/runtime/permission-gate";
import { CheckpointManager } from "@/lib/agent/runtime/checkpoint-manager";
import { RollbackManager } from "@/lib/agent/runtime/rollback-manager";
import type { Tool, ToolManifest, ChangeRecord } from "@/lib/agent/contracts";

// ─── EventBus Tests ───

describe("EventBus", () => {
  let bus: EventBusImpl;

  beforeEach(() => {
    bus = new EventBusImpl();
  });

  it("should emit events to all subscribers", () => {
    const events: any[] = [];
    bus.subscribe((e) => events.push(e));

    bus.emit(makeEvent({ type: "task.completed", summary: "Done" }));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("task.completed");
    expect(events[0].summary).toBe("Done");
  });

  it("should support multiple subscribers", () => {
    const events1: any[] = [];
    const events2: any[] = [];
    bus.subscribe((e) => events1.push(e));
    bus.subscribe((e) => events2.push(e));

    bus.emit(makeEvent({ type: "task.completed", summary: "Done" }));
    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(1);
  });

  it("should support type-specific subscriptions", () => {
    const completed: any[] = [];
    const failed: any[] = [];
    bus.subscribeType("task.completed", (e) => completed.push(e));
    bus.subscribeType("task.failed", (e) => failed.push(e));

    bus.emit(makeEvent({ type: "task.completed", summary: "Done" }));
    bus.emit(makeEvent({ type: "task.failed", error: { code: "ERR", message: "Fail", recoverable: false } }));

    expect(completed).toHaveLength(1);
    expect(failed).toHaveLength(1);
  });

  it("should return unsubscribe function", () => {
    const events: any[] = [];
    const unsub = bus.subscribe((e) => events.push(e));

    bus.emit(makeEvent({ type: "task.completed", summary: "1" }));
    expect(events).toHaveLength(1);

    unsub();
    bus.emit(makeEvent({ type: "task.completed", summary: "2" }));
    expect(events).toHaveLength(1); // not incremented
  });

  it("should handle handler errors gracefully", () => {
    bus.subscribe(() => { throw new Error("Handler error"); });
    const events: any[] = [];
    bus.subscribe((e) => events.push(e));

    bus.emit(makeEvent({ type: "task.completed", summary: "Done" }));
    expect(events).toHaveLength(1); // second handler still receives
  });

  it("should count subscribers", () => {
    expect(bus.subscriberCount()).toBe(0);
    const unsub = bus.subscribe(() => {});
    expect(bus.subscriberCount()).toBe(1);
    unsub();
    expect(bus.subscriberCount()).toBe(0);
  });
});

// ─── PermissionGate Tests ───

describe("PermissionGate", () => {
  let bus: EventBusImpl;
  let gate: PermissionGateImpl;

  beforeEach(() => {
    bus = new EventBusImpl();
    gate = new PermissionGateImpl(bus);
  });

  it("should return allow for allow-level tools", () => {
    const manifest: ToolManifest = {
      name: "test", description: "", capabilities: [],
      cost: "cheap", estimatedTimeMs: 100, permission: "allow",
      timeout: 5000, parallel: true, parallelSafe: true,
      cacheable: true, cacheTtl: 300000, streamable: false,
      confidence: 1.0, maxRetries: 0,
      inputSchema: { type: "object", properties: {}, required: [] },
      outputSchema: { type: "object", properties: {}, required: [] },
    };
    expect(gate.check("test", {}, manifest)).toBe("allow");
  });

  it("should return deny for deny-level tools", () => {
    const manifest: ToolManifest = {
      name: "test", description: "", capabilities: [],
      cost: "expensive", estimatedTimeMs: 5000, permission: "deny",
      timeout: 60000, parallel: false, parallelSafe: false,
      cacheable: false, cacheTtl: 0, streamable: false,
      confidence: 0.8, maxRetries: 0,
      inputSchema: { type: "object", properties: {}, required: [] },
      outputSchema: { type: "object", properties: {}, required: [] },
    };
    expect(gate.check("test", {}, manifest)).toBe("deny");
  });

  it("should immediately allow for allow-level", async () => {
    const result = await gate.request("node-1", "test", {}, {
      name: "test", description: "", capabilities: [],
      cost: "cheap", estimatedTimeMs: 100, permission: "allow",
      timeout: 5000, parallel: true, parallelSafe: true,
      cacheable: true, cacheTtl: 300000, streamable: false,
      confidence: 1.0, maxRetries: 0,
      inputSchema: { type: "object", properties: {}, required: [] },
      outputSchema: { type: "object", properties: {}, required: [] },
    });
    expect(result).toBe(true);
  });

  it("should immediately deny for deny-level", async () => {
    const result = await gate.request("node-1", "test", {}, {
      name: "test", description: "", capabilities: [],
      cost: "expensive", estimatedTimeMs: 5000, permission: "deny",
      timeout: 60000, parallel: false, parallelSafe: false,
      cacheable: false, cacheTtl: 0, streamable: false,
      confidence: 0.8, maxRetries: 0,
      inputSchema: { type: "object", properties: {}, required: [] },
      outputSchema: { type: "object", properties: {}, required: [] },
    });
    expect(result).toBe(false);
  });

  it("should wait for response for prompt-level", async () => {
    const manifest: ToolManifest = {
      name: "apply-patch", description: "", capabilities: [],
      cost: "medium", estimatedTimeMs: 1000, permission: "prompt",
      timeout: 30000, parallel: false, parallelSafe: false,
      cacheable: false, cacheTtl: 0, streamable: false,
      confidence: 0.9, maxRetries: 1,
      inputSchema: { type: "object", properties: {}, required: [] },
      outputSchema: { type: "object", properties: {}, required: [] },
    };

    // v2.0: PermissionGate no longer emits permission.requested via eventBus
    // (the ExecutionEngine owns that, via the async generator yield). The gate
    // just awaits respond(). Simulate the UI granting permission:
    setTimeout(() => gate.respond("node-1", true), 10);

    const result = await gate.request("node-1", "apply-patch", { patch: "diff" }, manifest);
    expect(result).toBe(true);
    expect(gate.isPending("node-1")).toBe(false);
  });

  it("should handle denied permission", async () => {
    const manifest: ToolManifest = {
      name: "test", description: "", capabilities: [],
      cost: "medium", estimatedTimeMs: 1000, permission: "prompt",
      timeout: 30000, parallel: false, parallelSafe: false,
      cacheable: false, cacheTtl: 0, streamable: false,
      confidence: 0.9, maxRetries: 1,
      inputSchema: { type: "object", properties: {}, required: [] },
      outputSchema: { type: "object", properties: {}, required: [] },
    };

    // v2.0: Simulate UI denying permission via respond()
    setTimeout(() => gate.respond("node-1", false, "User rejected"), 10);

    const result = await gate.request("node-1", "test", {}, manifest);
    expect(result).toBe(false);
  });

  it("should auto-deny on timeout (no infinite hang)", async () => {
    const manifest: ToolManifest = {
      name: "test", description: "", capabilities: [],
      cost: "medium", estimatedTimeMs: 1000, permission: "prompt",
      timeout: 30000, parallel: false, parallelSafe: false,
      cacheable: false, cacheTtl: 0, streamable: false,
      confidence: 0.9, maxRetries: 1,
      inputSchema: { type: "object", properties: {}, required: [] },
      outputSchema: { type: "object", properties: {}, required: [] },
    };

    // Short timeout for the test
    gate.setTimeoutMs(50);

    // No respond() call — should auto-deny after 50ms instead of hanging
    const t0 = Date.now();
    const result = await gate.request("node-timeout", "test", {}, manifest);
    const elapsed = Date.now() - t0;

    expect(result).toBe(false);
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(500);
    expect(gate.isPending("node-timeout")).toBe(false);
  });

  it("should track pending requests", async () => {
    const manifest: ToolManifest = {
      name: "test", description: "", capabilities: [],
      cost: "medium", estimatedTimeMs: 1000, permission: "prompt",
      timeout: 30000, parallel: false, parallelSafe: false,
      cacheable: false, cacheTtl: 0, streamable: false,
      confidence: 0.9, maxRetries: 1,
      inputSchema: { type: "object", properties: {}, required: [] },
      outputSchema: { type: "object", properties: {}, required: [] },
    };

    const promise = gate.request("node-2", "test", {}, manifest);
    expect(gate.isPending("node-2")).toBe(true);

    gate.respond("node-2", true);
    await promise;
    expect(gate.isPending("node-2")).toBe(false);
  });

  it("should cancel all pending requests", async () => {
    const manifest: ToolManifest = {
      name: "test", description: "", capabilities: [],
      cost: "medium", estimatedTimeMs: 1000, permission: "prompt",
      timeout: 30000, parallel: false, parallelSafe: false,
      cacheable: false, cacheTtl: 0, streamable: false,
      confidence: 0.9, maxRetries: 1,
      inputSchema: { type: "object", properties: {}, required: [] },
      outputSchema: { type: "object", properties: {}, required: [] },
    };

    const promise = gate.request("node-3", "test", {}, manifest);
    gate.cancelAll();
    const result = await promise;
    expect(result).toBe(false); // cancelled = denied
  });
});

// ─── CheckpointManager Tests ───

describe("CheckpointManager", () => {
  let manager: CheckpointManager;

  beforeEach(() => {
    manager = new CheckpointManager();
  });

  it("should save and load checkpoints", () => {
    const plan = { graph: { nodes: [], edges: [], entryPoints: [] }, policy: {} as any, estimatedTokens: 0, estimatedTimeMs: 0 };
    manager.save("task-1", plan, ["node-1"], null, {});

    const cp = manager.load("task-1");
    expect(cp).not.toBeNull();
    expect(cp!.taskId).toBe("task-1");
    expect(cp!.completedNodeIds).toEqual(["node-1"]);
  });

  it("should load latest checkpoint (multiple saves)", () => {
    const plan = { graph: { nodes: [], edges: [], entryPoints: [] }, policy: {} as any, estimatedTokens: 0, estimatedTimeMs: 0 };
    manager.save("task-1", plan, ["node-1"], null, {});
    manager.save("task-1", plan, ["node-1", "node-2"], null, {});

    const cp = manager.load("task-1");
    expect(cp!.completedNodeIds).toEqual(["node-1", "node-2"]);
  });

  it("should return null for unknown task", () => {
    expect(manager.load("nonexistent")).toBeNull();
  });

  it("should count checkpoints per task", () => {
    const plan = { graph: { nodes: [], edges: [], entryPoints: [] }, policy: {} as any, estimatedTokens: 0, estimatedTimeMs: 0 };
    manager.save("task-1", plan, [], null, {});
    manager.save("task-1", plan, ["a"], null, {});
    expect(manager.count("task-1")).toBe(2);
  });

  it("should clear checkpoints for a task", () => {
    const plan = { graph: { nodes: [], edges: [], entryPoints: [] }, policy: {} as any, estimatedTokens: 0, estimatedTimeMs: 0 };
    manager.save("task-1", plan, [], null, {});
    manager.clear("task-1");
    expect(manager.count("task-1")).toBe(0);
  });

  it("should mark completed nodes in plan", () => {
    const plan = {
      graph: {
        nodes: [
          { id: "a", step: "A", capability: "find-symbol" as const, params: {}, dependsOn: [], status: "pending" as const },
          { id: "b", step: "B", capability: "find-issues" as const, params: {}, dependsOn: ["a"], status: "pending" as const },
        ],
        edges: [],
        entryPoints: ["a"],
      },
      policy: {} as any,
      estimatedTokens: 0,
      estimatedTimeMs: 0,
    };

    const updated = CheckpointManager.markCompleted(plan, ["a"]);
    expect(updated.graph.nodes[0].status).toBe("done");
    expect(updated.graph.nodes[1].status).toBe("pending");
  });
});

// ─── RollbackManager Tests ───

describe("RollbackManager", () => {
  let manager: RollbackManager;

  beforeEach(() => {
    manager = new RollbackManager();
  });

  it("should track changes", () => {
    const change: ChangeRecord = { file: "test.ts", type: "update", oldContent: "old" };
    manager.track(change);
    expect(manager.count()).toBe(1);
    expect(manager.hasChanges()).toBe(true);
  });

  it("should track multiple changes", () => {
    manager.trackAll([
      { file: "a.ts", type: "create" },
      { file: "b.ts", type: "update", oldContent: "old" },
    ]);
    expect(manager.count()).toBe(2);
  });

  it("should rollback and clear changes", async () => {
    manager.track({ file: "test.ts", type: "create" });
    expect(manager.hasChanges()).toBe(true);

    const result = await manager.rollback();
    expect(result.ok).toBe(true);
    expect(manager.hasChanges()).toBe(false);
  });

  it("should clear without rollback", () => {
    manager.track({ file: "test.ts", type: "create" });
    manager.clear();
    expect(manager.count()).toBe(0);
  });

  it("should return ok for empty rollback", async () => {
    const result = await manager.rollback();
    expect(result.ok).toBe(true);
  });
});

// ─── makeEvent helper Tests ───

describe("makeEvent", () => {
  it("should add timestamp to event", () => {
    const event = makeEvent({ type: "task.completed", summary: "Done" });
    expect(event.timestamp).toBeGreaterThan(0);
    expect(event.type).toBe("task.completed");
  });
});
