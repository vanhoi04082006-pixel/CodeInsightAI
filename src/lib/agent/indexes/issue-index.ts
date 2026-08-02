// CodeInsight AI — Issue Index (Layer 1)
// O(1) lookups for issues by file, category, severity, and symbol.
// Built from SemanticProjectModel.issues.

import type {
  SemanticIssue,
  SemanticSymbol,
  IssueIndex as IIssueIndex,
} from "../contracts";
import { SymbolIndexImpl } from "./symbol-index";

export class IssueIndexImpl implements IIssueIndex {
  private readonly byFileMap = new Map<string, SemanticIssue[]>();
  private readonly byCategoryMap = new Map<string, SemanticIssue[]>();
  private readonly bySeverityMap = new Map<string, SemanticIssue[]>();
  private readonly bySymbolMap = new Map<string, SemanticIssue[]>();
  private readonly symbolIndex: SymbolIndexImpl;

  constructor(
    issues: readonly SemanticIssue[],
    symbols: readonly SemanticSymbol[],
  ) {
    this.symbolIndex = new SymbolIndexImpl(symbols);

    // Build symbol → file path lookup
    const fileToSymbols = new Map<string, Set<string>>();
    for (const sym of symbols) {
      const set = fileToSymbols.get(sym.file) ?? new Set();
      set.add(sym.id);
      fileToSymbols.set(sym.file, set);
    }

    for (const issue of issues) {
      // byFile
      const fileArr = this.byFileMap.get(issue.file) ?? [];
      fileArr.push(issue);
      this.byFileMap.set(issue.file, fileArr);

      // byCategory
      const catArr = this.byCategoryMap.get(issue.category) ?? [];
      catArr.push(issue);
      this.byCategoryMap.set(issue.category, catArr);

      // bySeverity
      const sevArr = this.bySeverityMap.get(issue.severity) ?? [];
      sevArr.push(issue);
      this.bySeverityMap.set(issue.severity, sevArr);

      // bySymbol — link issues to symbols declared in the same file
      const symbolIds = fileToSymbols.get(issue.file);
      if (symbolIds) {
        for (const symbolId of symbolIds) {
          const symArr = this.bySymbolMap.get(symbolId) ?? [];
          symArr.push(issue);
          this.bySymbolMap.set(symbolId, symArr);
        }
      }
    }
  }

  byFile(file: string): SemanticIssue[] {
    return this.byFileMap.get(file) ?? [];
  }

  byCategory(cat: SemanticIssue["category"]): SemanticIssue[] {
    return this.byCategoryMap.get(cat) ?? [];
  }

  bySeverity(sev: SemanticIssue["severity"]): SemanticIssue[] {
    return this.bySeverityMap.get(sev) ?? [];
  }

  bySymbol(symbolId: string): SemanticIssue[] {
    return this.bySymbolMap.get(symbolId) ?? [];
  }
}

