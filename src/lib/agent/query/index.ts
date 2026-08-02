// CodeInsight AI — Query Service Public API (Layer 2)
// Barrel export for the Semantic Query Service module.

export type {
  SemanticQueryService,
  ImpactReport,
  SearchOptions,
  IssueFilter,
  DuplicateGroup,
  DiagramOptions,
} from "../contracts";

export { SemanticQueryServiceImpl, createQueryService } from "./query-service";
