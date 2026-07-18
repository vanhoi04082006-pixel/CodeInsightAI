// CodeInsight AI — Shared Context for Multi-Agent System
import type { AgentDecision, AgentEvent, AgentId, SharedContext } from "./types";
import { eventBus } from "./event-bus";

export function createSharedContext(taskId: string, init?: Partial<SharedContext>): SharedContext {
  return {
    taskId,
    repositoryPath: init?.repositoryPath,
    repositoryUrl: init?.repositoryUrl,
    analysisReport: init?.analysisReport,
    workingFiles: init?.workingFiles ?? new Map(),
    memory: init?.memory ?? new Map(),
    decisions: init?.decisions ?? [],
    events: init?.events ?? [],
  };
}

class ContextRegistry {
  private contexts = new Map<string, SharedContext>();

  get(taskId: string): SharedContext | undefined {
    return this.contexts.get(taskId);
  }

  getOrCreate(taskId: string, init?: Partial<SharedContext>): SharedContext {
    let ctx = this.contexts.get(taskId);
    if (!ctx) {
      ctx = createSharedContext(taskId, init);
      this.contexts.set(taskId, ctx);
    }
    return ctx;
  }

  set(taskId: string, ctx: SharedContext): void {
    this.contexts.set(taskId, ctx);
  }

  delete(taskId: string): void {
    this.contexts.delete(taskId);
  }

  recordDecision(taskId: string, agent: AgentId, decision: string, rationale: string): void {
    const ctx = this.getOrCreate(taskId);
    const d: AgentDecision = {
      id: `dec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      agent,
      decision,
      rationale,
      timestamp: Date.now(),
    };
    ctx.decisions.push(d);
  }

  recordEvent(taskId: string, agent: AgentId, type: string, message: string, level: AgentEvent["level"] = "info", data?: any): void {
    const ctx = this.getOrCreate(taskId);
    const e: AgentEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      agent,
      message,
      level,
      timestamp: Date.now(),
      data,
    };
    ctx.events.push(e);
    eventBus.emit({ type: "agent:event", event: e });
  }

  setWorkingFile(taskId: string, path: string, content: string): void {
    this.getOrCreate(taskId).workingFiles.set(path, content);
  }

  getWorkingFile(taskId: string, path: string): string | undefined {
    return this.get(taskId)?.workingFiles.get(path);
  }

  setMemory(taskId: string, key: string, value: any): void {
    this.getOrCreate(taskId).memory.set(key, value);
  }

  getMemory(taskId: string, key: string): any {
    return this.get(taskId)?.memory.get(key);
  }
}

export const contextRegistry = new ContextRegistry();
