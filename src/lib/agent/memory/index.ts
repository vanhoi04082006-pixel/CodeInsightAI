// CodeInsight AI — Memory Public API (Layer 7)
// Barrel export for 4-layer memory system.

export type {
  AgentMemory,
  WorkingMemory,
  TaskMemory,
  SessionMemory,
  ProjectMemory,
  KnowledgeMemory,
  PendingChoice,
  ExecutionLogEntry,
  ConversationMessage,
  UserPreferences,
  LearnedPattern,
  PastFix,
  UserConvention,
} from "../contracts";

export { WorkingMemoryImpl } from "./working-memory";
export { TaskMemoryImpl } from "./task-memory";
export { SessionMemoryImpl } from "./session-memory";
export { ProjectMemoryImpl } from "./project-memory";
export { AgentMemoryImpl, createAgentMemory } from "./agent-memory";
