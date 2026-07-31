// CodeInsight AI — Base Agent abstract class
// All specialized agents extend this.
//
// Simplified: no registry, no event bus, no shared context, no message bus.
// Agents are called DIRECTLY via /api/agents/execute — no queue, no scheduler,
// no direct-call infrastructure. The run() wrapper just handles progress
// reporting + error catching; logs go to console.

import type { AgentId, AgentInfo, Task, TaskResult } from "./types";

export abstract class BaseAgent {
  abstract readonly id: AgentId;
  abstract readonly info: AgentInfo;

  /** Main execution entry — subclasses implement. */
  protected abstract execute(task: Task, signal: AbortSignal, onProgress: (p: number, msg: string) => void): Promise<TaskResult>;

  /** Public run wrapper — handles progress + errors. */
  async run(task: Task, signal: AbortSignal, onProgress?: (p: number, msg: string) => void): Promise<TaskResult> {
    const progress = onProgress ?? (() => {});
    progress(5, `${this.info.name} starting`);
    try {
      const result = await this.execute(task, signal, progress);
      console.log(`[agent] ${this.info.name} completed: ${result.summary}`);
      return result;
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      console.error(`[agent] ${this.info.name} failed: ${errMsg}`);
      return {
        success: false,
        data: { error: errMsg },
        summary: `${this.info.name} failed: ${errMsg}`,
        artifacts: [],
      };
    }
  }

  /** Emit a log line (now just routes to console). */
  protected log(level: "info" | "warn" | "error" | "debug", message: string): void {
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(`[${this.info.name}] [${level}] ${message}`);
  }

  /** Record a decision — kept for backward compat with the 10 agent files; now a no-op (just console-logs). */
  protected recordDecision(_taskId: string, decision: string, rationale: string): void {
    console.log(`[${this.info.name}] decision: ${decision} — ${rationale}`);
  }
}
