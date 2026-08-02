// CodeInsight AI — Agent SPM Types (Layer 0)
//
// Re-exports SPM interfaces from the frozen contracts.
// This file exists so that SPM implementation files can import from
// a local module rather than reaching across layer boundaries.

export type {
  SemanticProjectModel,
  SemanticFile,
  SemanticSymbol,
  SemanticEdge,
  SemanticIssue,
  SemanticInsight,
  SemanticArchitecture,
  SemanticMetrics,
  Result,
  AgentError,
} from "../contracts";
