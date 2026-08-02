// CodeInsight AI — Memory Tests (Layer 7)

import { describe, it, expect, beforeEach } from "@jest/globals";
import { WorkingMemoryImpl } from "@/lib/agent/memory/working-memory";
import { TaskMemoryImpl } from "@/lib/agent/memory/task-memory";
import { SessionMemoryImpl } from "@/lib/agent/memory/session-memory";
import { ProjectMemoryImpl } from "@/lib/agent/memory/project-memory";
import { AgentMemoryImpl } from "@/lib/agent/memory/agent-memory";
import type { SemanticIssue } from "@/lib/agent/contracts";

// ─── WorkingMemory Tests ───

describe("WorkingMemory", () => {
  let wm: WorkingMemoryImpl;

  beforeEach(() => {
    wm = new WorkingMemoryImpl();
  });

  it("should initialize with nulls and empty arrays", () => {
    expect(wm.currentHypothesis).toBeNull();
    expect(wm.currentFile).toBeNull();
    expect(wm.currentFunction).toBeNull();
    expect(wm.currentSymbol).toBeNull();
    expect(wm.currentBug).toBeNull();
    expect(wm.currentStep).toBeNull();
    expect(wm.scratchpad).toEqual([]);
    expect(wm.pendingChoices).toEqual([]);
  });

  it("should update fields via update()", () => {
    wm.update({
      currentFile: "src/app.ts",
      currentFunction: "handleLogin",
      currentStep: "step-1",
    });
    expect(wm.currentFile).toBe("src/app.ts");
    expect(wm.currentFunction).toBe("handleLogin");
    expect(wm.currentStep).toBe("step-1");
  });

  it("should push notes to scratchpad", () => {
    wm.pushScratch("Found 3 callers");
    wm.pushScratch("DB query takes 2.3s");
    expect(wm.scratchpad).toHaveLength(2);
    expect(wm.scratchpad[0]).toContain("Found 3 callers");
    expect(wm.scratchpad[1]).toContain("DB query takes 2.3s");
  });

  it("should add timestamp to scratchpad entries", () => {
    wm.pushScratch("test note");
    expect(wm.scratchpad[0]).toMatch(/^\[.+\] test note$/);
  });

  it("should clear all fields", () => {
    wm.update({ currentFile: "test.ts", currentStep: "step-1" });
    wm.pushScratch("note");
    wm.clear();
    expect(wm.currentFile).toBeNull();
    expect(wm.currentStep).toBeNull();
    expect(wm.scratchpad).toEqual([]);
  });

  it("should manage pending choices", () => {
    wm.addChoice({ id: "c1", question: "Which fix?", options: ["A", "B"] });
    expect(wm.pendingChoices).toHaveLength(1);
    expect(wm.pendingChoices[0].selected).toBeUndefined();

    wm.resolveChoice("c1", "A");
    expect(wm.pendingChoices[0].selected).toBe("A");
  });

  it("should snapshot current state", () => {
    wm.update({ currentFile: "test.ts", currentStep: "step-1" });
    wm.pushScratch("note");
    const snap = wm.snapshot();
    expect(snap.currentFile).toBe("test.ts");
    expect(snap.currentStep).toBe("step-1");
    expect(snap.scratchpad).toHaveLength(1);
  });
});

// ─── TaskMemory Tests ───

describe("TaskMemory", () => {
  let tm: TaskMemoryImpl;

  beforeEach(() => {
    tm = new TaskMemoryImpl("task-1", "fix bug login");
  });

  it("should initialize with taskId and query", () => {
    expect(tm.taskId).toBe("task-1");
    expect(tm.query).toBe("fix bug login");
    expect(tm.plan).toBeNull();
    expect(tm.executionLog).toEqual([]);
  });

  it("should add log entries", () => {
    tm.addLogEntry({
      nodeId: "node-1",
      tool: "find-symbol",
      params: { name: "login" },
      result: { found: true },
      duration: 150,
      timestamp: Date.now(),
    });
    expect(tm.executionLog).toHaveLength(1);
    expect(tm.hasNodeExecuted("node-1")).toBe(true);
    expect(tm.hasNodeExecuted("node-2")).toBe(false);
  });

  it("should get log for specific node", () => {
    tm.addLogEntry({ nodeId: "a", tool: "t1", params: {}, result: {}, duration: 100, timestamp: 1 });
    tm.addLogEntry({ nodeId: "b", tool: "t2", params: {}, result: {}, duration: 200, timestamp: 2 });
    tm.addLogEntry({ nodeId: "a", tool: "t1", params: {}, result: {}, duration: 50, timestamp: 3 });

    const logA = tm.getLogForNode("a");
    expect(logA).toHaveLength(2);
  });

  it("should compute total duration", () => {
    tm.addLogEntry({ nodeId: "a", tool: "t1", params: {}, result: {}, duration: 100, timestamp: 1 });
    tm.addLogEntry({ nodeId: "b", tool: "t2", params: {}, result: {}, duration: 200, timestamp: 2 });
    expect(tm.getTotalDuration()).toBe(300);
  });
});

// ─── SessionMemory Tests ───

describe("SessionMemory", () => {
  let sm: SessionMemoryImpl;

  beforeEach(() => {
    // Clear storage before each test
    if (typeof window !== "undefined") {
      sessionStorage.clear();
    }
    sm = new SessionMemoryImpl();
  });

  it("should initialize with defaults", () => {
    expect(sm.messages).toEqual([]);
    expect(sm.locale).toBe("en");
    expect(sm.preferences.autoApproveReadTools).toBe(true);
    expect(sm.preferences.autoApproveWriteTools).toBe(false);
    expect(sm.preferences.maxParallel).toBe(3);
  });

  it("should add messages", () => {
    sm.addMessage({ id: "m1", role: "user", content: "Hello", timestamp: Date.now() });
    sm.addMessage({ id: "m2", role: "assistant", content: "Hi there", timestamp: Date.now() });
    expect(sm.messages).toHaveLength(2);
  });

  it("should clear messages", () => {
    sm.addMessage({ id: "m1", role: "user", content: "Hello", timestamp: Date.now() });
    sm.clear();
    expect(sm.messages).toEqual([]);
  });

  it("should update preferences", () => {
    sm.updatePreferences({ maxParallel: 5, autoApproveWriteTools: true });
    expect(sm.preferences.maxParallel).toBe(5);
    expect(sm.preferences.autoApproveWriteTools).toBe(true);
  });

  it("should set locale", () => {
    sm.setLocale("vi");
    expect(sm.locale).toBe("vi");
  });

  it("should get recent messages", () => {
    for (let i = 0; i < 30; i++) {
      sm.addMessage({ id: `m${i}`, role: "user", content: `msg ${i}`, timestamp: i });
    }
    const recent = sm.getRecentMessages(5);
    expect(recent).toHaveLength(5);
    expect(recent[0].content).toBe("msg 25");
    expect(recent[4].content).toBe("msg 29");
  });

  it("should get messages by role", () => {
    sm.addMessage({ id: "m1", role: "user", content: "q", timestamp: 1 });
    sm.addMessage({ id: "m2", role: "assistant", content: "a", timestamp: 2 });
    sm.addMessage({ id: "m3", role: "tool", content: "result", timestamp: 3 });

    const userMsgs = sm.getMessagesByRole("user");
    expect(userMsgs).toHaveLength(1);
  });
});

// ─── ProjectMemory Tests ───

describe("ProjectMemory", () => {
  let pm: ProjectMemoryImpl;

  beforeEach(() => {
    pm = new ProjectMemoryImpl();
  });

  it("should initialize empty", () => {
    expect(pm.spm).toBeNull();
    expect(pm.indexes).toBeNull();
    expect(pm.isLoaded()).toBe(false);
  });

  it("should cache graph data", () => {
    const graphData = { nodes: [{ id: "n1" }], edges: [] } as any;
    pm.cacheGraph("dependency", graphData);
    expect(pm.getCachedGraph("dependency")).toEqual(graphData);
    expect(pm.getCachedGraph("nonexistent")).toBeNull();
  });

  it("should cache diagram data", () => {
    pm.cacheDiagram("uml", { nodes: [] });
    expect(pm.getCachedDiagram("uml")).toEqual({ nodes: [] });
    expect(pm.getCachedDiagram("nonexistent")).toBeNull();
  });

  it("should cache search results", () => {
    const results = [{ file: "a.ts", line: 1, text: "test", score: 1.0 }];
    pm.cacheSearch("login", results);
    expect(pm.getCachedSearch("login")).toEqual(results);
    expect(pm.getCachedSearch("nonexistent")).toBeNull();
  });

  it("should invalidate all caches", () => {
    pm.cacheGraph("g", {} as any);
    pm.cacheDiagram("d", {});
    pm.cacheSearch("s", []);
    pm.invalidate();
    expect(pm.getCachedGraph("g")).toBeNull();
    expect(pm.getCachedDiagram("d")).toBeNull();
    expect(pm.getCachedSearch("s")).toBeNull();
  });

  it("should clear everything", () => {
    pm.cacheGraph("g", {} as any);
    pm.clear();
    expect(pm.spm).toBeNull();
    expect(pm.indexes).toBeNull();
    expect(pm.getCachedGraph("g")).toBeNull();
  });

  it("should report cache stats", () => {
    pm.cacheGraph("g1", {} as any);
    pm.cacheGraph("g2", {} as any);
    pm.cacheDiagram("d1", {});
    pm.cacheSearch("s1", []);
    const stats = pm.getStats();
    expect(stats.graphs).toBe(2);
    expect(stats.diagrams).toBe(1);
    expect(stats.searches).toBe(1);
  });
});

// ─── AgentMemory Facade Tests ───

describe("AgentMemory", () => {
  it("should combine all 4 memory layers", () => {
    const am = new AgentMemoryImpl("task-1", "test query");
    expect(am.working).toBeDefined();
    expect(am.task).toBeDefined();
    expect(am.session).toBeDefined();
    expect(am.project).toBeDefined();
    expect(am.knowledge).toBeDefined(); // stub
  });

  it("should start a new task (clear working memory)", () => {
    const am = new AgentMemoryImpl("task-1", "query1");
    am.working.update({ currentFile: "test.ts" });
    am.startTask("task-2", "query2");
    expect(am.working.currentFile).toBeNull();
    expect(am.task.taskId).toBe("task-2");
    expect(am.task.query).toBe("query2");
  });

  it("should complete task (clear working memory)", () => {
    const am = new AgentMemoryImpl("task-1", "query1");
    am.working.update({ currentFile: "test.ts", currentStep: "step-1" });
    am.completeTask();
    expect(am.working.currentFile).toBeNull();
    expect(am.working.currentStep).toBeNull();
  });

  it("should check if project memory is ready", () => {
    const am = new AgentMemoryImpl();
    expect(am.isReady()).toBe(false);
  });
});
