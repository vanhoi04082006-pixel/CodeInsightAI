// CodeInsight AI — Index System Public API (Layer 1)
// Barrel export for all 6 indexes + builder.

export type {
  IndexSystem,
  SymbolIndex,
  ReferenceIndex,
  CallIndex,
  CallChainNode,
  ImportIndex,
  IssueIndex,
  PathIndex,
} from "../contracts";

export { SymbolIndexImpl } from "./symbol-index";
export { ReferenceIndexImpl } from "./reference-index";
export { CallIndexImpl } from "./call-index";
export { ImportIndexImpl } from "./import-index";
export { IssueIndexImpl } from "./issue-index";
export { PathIndexImpl } from "./path-index";
export { buildIndexes } from "./index-builder";
