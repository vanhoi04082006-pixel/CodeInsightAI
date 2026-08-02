// CodeInsight AI — SPM Public API (Layer 0)
//
// Barrel export for the Semantic Project Model module.

export type {
  SemanticProjectModel,
  SemanticFile,
  SemanticSymbol,
  SemanticEdge,
  SemanticIssue,
  SemanticInsight,
  SemanticArchitecture,
  SemanticMetrics,
} from "./types";

export { buildSPM, SPM_SCHEMA_VERSION } from "./builder";
export { serializeSPM, deserializeSPM } from "./serializer";
