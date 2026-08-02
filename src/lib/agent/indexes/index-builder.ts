// CodeInsight AI — Index Builder (Layer 1)
// Builds all 6 indexes from a SemanticProjectModel in a single pass.
// Total build complexity: O(n) where n = total symbols + edges + issues.

import type { SemanticProjectModel, IndexSystem } from "../contracts";
import { SymbolIndexImpl } from "./symbol-index";
import { ReferenceIndexImpl } from "./reference-index";
import { CallIndexImpl } from "./call-index";
import { ImportIndexImpl } from "./import-index";
import { IssueIndexImpl } from "./issue-index";
import { PathIndexImpl } from "./path-index";

/**
 * Build the complete IndexSystem from a SemanticProjectModel.
 * All indexes are constructed in O(n) time.
 */
export function buildIndexes(spm: SemanticProjectModel): IndexSystem {
  const symbol = new SymbolIndexImpl(spm.symbols);
  const reference = new ReferenceIndexImpl(spm.edges);
  const call = new CallIndexImpl(spm.symbols, spm.edges);
  const import_ = new ImportIndexImpl(spm.edges);
  const issue = new IssueIndexImpl(spm.issues, spm.symbols);
  const path = new PathIndexImpl(spm.edges);

  return {
    symbol,
    reference,
    call,
    import: import_,
    issue,
    path,
  };
}
