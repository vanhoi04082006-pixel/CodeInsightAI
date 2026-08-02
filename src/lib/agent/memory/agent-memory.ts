// CodeInsight AI — Agent Memory Facade (Layer 7)
// Combines all 4 memory layers into a single AgentMemory interface.
// Knowledge Memory (Layer 5) is deferred — not implemented in MVP.

import type {
  AgentMemory as IAgentMemory,
  WorkingMemory,
  TaskMemory,
  SessionMemory,
  ProjectMemory,
  SemanticProjectModel,
  IndexSystem,
} from "../contracts";
import { WorkingMemoryImpl } from "./working-memory";
import { TaskMemoryImpl } from "./task-memory";
import { SessionMemoryImpl } from "./session-memory";
import { ProjectMemoryImpl } from "./project-memory";

export class AgentMemoryImpl implements IAgentMemory {
  readonly working: WorkingMemoryImpl;
  readonly task: TaskMemoryImpl;
  readonly session: SessionMemoryImpl;
  readonly project: ProjectMemoryImpl;

  // Knowledge Memory — deferred (returns empty stub)
  readonly knowledge = {
    patterns: [],
    pastFixes: [],
    userConventions: [],
    async load() {},
    async save() {},
    addPattern() {},
    addFix() {},
  };

  constructor(taskId: string = `task-${Date.now()}`, query: string = "") {
    this.working = new WorkingMemoryImpl();
    this.task = new TaskMemoryImpl(taskId, query);
    this.session = new SessionMemoryImpl();
    this.project = new ProjectMemoryImpl();
  }

  /** Initialize project memory from SPM + indexes */
  initializeProject(spm: SemanticProjectModel, indexes: IndexSystem): void {
    this.project.setSPM(spm);
    this.project.setIndexes(indexes);
  }

  /** Start a new task — clear working memory, reset task memory */
  startTask(taskId: string, query: string): void {
    this.working.clear();
    this.task.taskId = taskId;
    this.task.query = query;
    this.task.plan = null;
    this.task.executionLog = [];
  }

  /** Complete a task — clear working memory */
  completeTask(): void {
    this.working.clear();
  }

  /** Check if project memory is loaded */
  isReady(): boolean {
    return this.project.isLoaded();
  }
}

/** Create a new AgentMemory instance */
export function createAgentMemory(taskId?: string, query?: string): AgentMemoryImpl {
  return new AgentMemoryImpl(taskId, query);
}
