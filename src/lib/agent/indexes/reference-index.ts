// CodeInsight AI — Reference Index (Layer 1)
// O(1) lookups for edges referencing a symbol (incoming and outgoing).
// Built from SemanticProjectModel.edges.

import type { SemanticEdge, ReferenceIndex as IReferenceIndex } from "../contracts";

export class ReferenceIndexImpl implements IReferenceIndex {
  private readonly incomingMap = new Map<string, SemanticEdge[]>();
  private readonly outgoingMap = new Map<string, SemanticEdge[]>();

  constructor(edges: readonly SemanticEdge[]) {
    for (const edge of edges) {
      // Outgoing: edges FROM source
      const outArr = this.outgoingMap.get(edge.source) ?? [];
      outArr.push(edge);
      this.outgoingMap.set(edge.source, outArr);

      // Incoming: edges TO target
      const inArr = this.incomingMap.get(edge.target) ?? [];
      inArr.push(edge);
      this.incomingMap.set(edge.target, inArr);
    }
  }

  /** Edges pointing TO this symbol (who references it) */
  referencesTo(symbolId: string): SemanticEdge[] {
    return this.incomingMap.get(symbolId) ?? [];
  }

  /** Edges pointing FROM this symbol (what it references) */
  referencesFrom(symbolId: string): SemanticEdge[] {
    return this.outgoingMap.get(symbolId) ?? [];
  }
}
