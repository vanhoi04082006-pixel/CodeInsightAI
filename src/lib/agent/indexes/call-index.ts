// CodeInsight AI — Call Index (Layer 1)
// O(1) lookups for callers/callees of a symbol.
// Transitive call chain via BFS (cached per query).

import type {
  SemanticSymbol,
  SemanticEdge,
  CallChainNode,
  CallIndex as ICallIndex,
} from "../contracts";
import { SymbolIndexImpl } from "./symbol-index";
import { ReferenceIndexImpl } from "./reference-index";

export class CallIndexImpl implements ICallIndex {
  private readonly symbolIndex: SymbolIndexImpl;
  private readonly referenceIndex: ReferenceIndexImpl;

  constructor(
    symbols: readonly SemanticSymbol[],
    edges: readonly SemanticEdge[],
  ) {
    this.symbolIndex = new SymbolIndexImpl(symbols);
    this.referenceIndex = new ReferenceIndexImpl(edges);
  }

  /** Direct callers of a symbol — who calls this */
  callers(symbolId: string): SemanticSymbol[] {
    const edges = this.referenceIndex.referencesTo(symbolId);
    const callEdges = edges.filter((e) => e.type === "calls");
    const callers: SemanticSymbol[] = [];
    const seen = new Set<string>();

    for (const edge of callEdges) {
      if (seen.has(edge.source)) continue;
      const sym = this.symbolIndex.byId(edge.source);
      if (sym) {
        callers.push(sym);
        seen.add(edge.source);
      }
    }
    return callers;
  }

  /** Direct callees of a symbol — what this calls */
  callees(symbolId: string): SemanticSymbol[] {
    const edges = this.referenceIndex.referencesFrom(symbolId);
    const callEdges = edges.filter((e) => e.type === "calls");
    const callees: SemanticSymbol[] = [];
    const seen = new Set<string>();

    for (const edge of callEdges) {
      if (seen.has(edge.target)) continue;
      const sym = this.symbolIndex.byId(edge.target);
      if (sym) {
        callees.push(sym);
        seen.add(edge.target);
      }
    }
    return callees;
  }

  /** Transitive call chain from entry point — BFS with depth limit */
  callChain(entry: string, maxDepth: number): CallChainNode[] {
    const entrySym = this.symbolIndex.byId(entry);
    if (!entrySym) return [];

    const visited = new Set<string>([entry]);
    const buildNode = (symbolId: string, depth: number): CallChainNode | null => {
      const sym = this.symbolIndex.byId(symbolId);
      if (!sym) return null;
      if (depth >= maxDepth) {
        return { symbol: sym, depth, children: [] };
      }

      const directCallees = this.callees(symbolId);
      const children: CallChainNode[] = [];
      for (const callee of directCallees) {
        if (visited.has(callee.id)) continue;
        visited.add(callee.id);
        const child = buildNode(callee.id, depth + 1);
        if (child) children.push(child);
      }
      return { symbol: sym, depth, children };
    };

    const root = buildNode(entry, 0);
    return root ? [root] : [];
  }
}
