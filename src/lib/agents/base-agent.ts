// CodeInsight AI — Base Agent abstract class
// All specialized agents extend this.

import type { AgentId, AgentInfo, Task, TaskResult, TaskKind } from "./types";
import { agentRegistry } from "./agent-registry";
import { contextRegistry } from "./shared-context";
import { messageBus } from "./message-bus";
import { eventBus } from "./event-bus";

export abstract class BaseAgent {
  abstract readonly id: AgentId;
  abstract readonly info: AgentInfo;

  /** Register this agent with the registry. Call once at boot. */
  register(handledKinds: TaskKind[] = []): void {
    agentRegistry.register(this.info, (task, signal, onProgress) => this.run(task, signal, onProgress), handledKinds);
    eventBus.emit({
      type: "log",
      level: "info",
      message: `[agent] Registered ${this.info.name} (handles: ${handledKinds.join(", ") || "none"})`,
      agent: this.id,
    });
  }

  /** Main execution entry — subclasses implement. */
  protected abstract execute(task: Task, signal: AbortSignal, onProgress: (p: number, msg: string) => void): Promise<TaskResult>;

  /** Public run wrapper — records decisions, handles errors. */
  async run(task: Task, signal: AbortSignal, onProgress?: (p: number, msg: string) => void): Promise<TaskResult> {
    const progress = onProgress ?? (() => {});
    contextRegistry.recordEvent(task.id, this.id, "agent-start", `${this.info.name} started task: ${task.title}`, "info");
    progress(5, `${this.info.name} starting`);
    try {
      const result = await this.execute(task, signal, progress);
      contextRegistry.recordEvent(task.id, this.id, "agent-complete", `${this.info.name} completed: ${result.summary}`, result.success ? "info" : "warn");
      return result;
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      contextRegistry.recordEvent(task.id, this.id, "agent-error", `${this.info.name} failed: ${errMsg}`, "error");
      return {
        success: false,
        data: null,
        summary: `${this.info.name} failed: ${errMsg}`,
        artifacts: [],
      };
    }
  }

  /** Send a message to another agent (or broadcast). */
  protected send(to: AgentId | "broadcast", type: import("./types").AgentMessage["type"], payload: any): string {
    return messageBus.send(this.id, to, type, payload);
  }

  /** Check inbox. */
  protected receive(): import("./types").AgentMessage[] {
    return messageBus.receive(this.id);
  }

  /** Emit a log event. */
  protected log(level: "info" | "warn" | "error" | "debug", message: string): void {
    eventBus.emit({ type: "log", level, message: `[${this.info.name}] ${message}`, agent: this.id });
  }

  /** Record a decision in shared context. */
  protected recordDecision(taskId: string, decision: string, rationale: string): void {
    contextRegistry.recordDecision(taskId, this.id, decision, rationale);
  }
}
