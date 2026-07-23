// CodeInsight AI — Agent Registry
import type { AgentId, AgentInfo, TaskKind } from "./types";

interface RegisteredAgent {
  info: AgentInfo;
  execute: (task: import("./types").Task, signal: AbortSignal, onProgress?: (p: number, msg: string) => void) => Promise<import("./types").TaskResult>;
}

class AgentRegistry {
  private agents = new Map<AgentId, RegisteredAgent>();
  private kindToAgent = new Map<TaskKind, AgentId>();

  register(info: AgentInfo, execute: RegisteredAgent["execute"], handledKinds: TaskKind[] = []): void {
    this.agents.set(info.id, { info, execute });
    for (const k of handledKinds) {
      this.kindToAgent.set(k, info.id);
    }
  }

  unregister(id: AgentId): void {
    this.agents.delete(id);
    for (const [k, a] of this.kindToAgent) {
      if (a === id) this.kindToAgent.delete(k);
    }
  }

  get(id: AgentId): RegisteredAgent | undefined {
    return this.agents.get(id);
  }

  getAgentForKind(kind: TaskKind): RegisteredAgent | undefined {
    const id = this.kindToAgent.get(kind);
    return id ? this.agents.get(id) : undefined;
  }

  list(): AgentInfo[] {
    return Array.from(this.agents.values()).map(a => a.info);
  }

  listActive(): AgentId[] {
    return Array.from(this.agents.keys());
  }
}

export const agentRegistry = new AgentRegistry();
