// CodeInsight AI — Symbol Index (Layer 1)
// O(1) lookups for symbols by name, id, file, and kind.
// Built from SemanticProjectModel.symbols.

import type { SemanticSymbol, SymbolIndex as ISymbolIndex } from "../contracts";

export class SymbolIndexImpl implements ISymbolIndex {
  private readonly byNameMap = new Map<string, SemanticSymbol[]>();
  private readonly byIdMap = new Map<string, SemanticSymbol>();
  private readonly byFileMap = new Map<string, SemanticSymbol[]>();
  private readonly byKindMap = new Map<string, SemanticSymbol[]>();

  constructor(symbols: readonly SemanticSymbol[]) {
    for (const sym of symbols) {
      // byName — case-sensitive
      const nameArr = this.byNameMap.get(sym.name) ?? [];
      nameArr.push(sym);
      this.byNameMap.set(sym.name, nameArr);

      // byId — last write wins (IDs should be unique)
      this.byIdMap.set(sym.id, sym);

      // byFile
      const fileArr = this.byFileMap.get(sym.file) ?? [];
      fileArr.push(sym);
      this.byFileMap.set(sym.file, fileArr);

      // byKind
      const kindArr = this.byKindMap.get(sym.kind) ?? [];
      kindArr.push(sym);
      this.byKindMap.set(sym.kind, kindArr);
    }
  }

  byName(name: string): SemanticSymbol[] {
    return this.byNameMap.get(name) ?? [];
  }

  byId(id: string): SemanticSymbol | null {
    return this.byIdMap.get(id) ?? null;
  }

  byFile(file: string): SemanticSymbol[] {
    return this.byFileMap.get(file) ?? [];
  }

  byKind(kind: SemanticSymbol["kind"]): SemanticSymbol[] {
    return this.byKindMap.get(kind) ?? [];
  }
}
