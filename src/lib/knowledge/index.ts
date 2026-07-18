// CodeInsight AI — Knowledge Base index
// Re-exports everything from the memory-store and semantic-memory modules.

export {
  memoryStore,
  MemoryStore,
  type MemoryEntry,
  type MemoryCategory,
  type MemorySearchOptions,
  type MemorySearchHit,
} from "./memory-store";

export {
  semanticMemory,
  SemanticMemory,
  type ConversationMessage,
  type FixRecord,
  type DecisionRecord,
  type CodingStyleRecord,
} from "./semantic-memory";
