// CodeInsight AI — Agent Memory Facade (Layer 7)
// Combines all 5 memory layers into a single AgentMemory interface.
//
// v2.0: KnowledgeMemory is now a REAL implementation backed by the AgentKnowledge
// DB table (was a stub in v1). The facade also exposes setUserId() so the
// route can scope knowledge to the authenticated user.

import type {
  AgentMemory as IAgentMemory,
  SemanticProjectModel,
  IndexSystem,
} from "../contracts";
import { WorkingMemoryImpl } from "./working-memory";
import { TaskMemoryImpl } from "./task-memory";
import { SessionMemoryImpl } from "./session-memory";
import { ProjectMemoryImpl } from "./project-memory";
import { KnowledgeMemoryImpl } from "./knowledge-memory";

export class AgentMemoryImpl implements IAgentMemory {
  readonly working: WorkingMemoryImpl;
  readonly task: TaskMemoryImpl;
  readonly session: SessionMemoryImpl;
  readonly project: ProjectMemoryImpl;
  readonly knowledge: KnowledgeMemoryImpl;

  constructor(taskId: string = `task-${Date.now()}`, query: string = "") {
    this.working = new WorkingMemoryImpl();
    this.task = new TaskMemoryImpl(taskId, query);
    this.session = new SessionMemoryImpl();
    this.project = new ProjectMemoryImpl();
    this.knowledge = new KnowledgeMemoryImpl();
  }

  /** Set the user ID for knowledge memory scoping (call before load()). */
  setUserId(userId: string | null): void {
    this.knowledge.setUserId(userId);
  }

  /** Load persistent memory (knowledge) from the database. Call after setUserId. */
  async load(): Promise<void> {
    await this.knowledge.load();
  }

  /** Save persistent memory (knowledge) to the database. Call before task ends. */
  async save(): Promise<void> {
    await this.knowledge.save();
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

  /** Complete a task — clear working memory, persist knowledge */
  async completeTask(): Promise<void> {
    this.working.clear();
    await this.knowledge.save();
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
