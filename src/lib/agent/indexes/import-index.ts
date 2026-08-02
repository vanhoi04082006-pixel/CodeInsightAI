// CodeInsight AI — Import Index (Layer 1)
// O(1) lookups for file-level import relationships.
// Transitive import chain via BFS.

import type {
  SemanticEdge,
  ImportIndex as IImportIndex,
} from "../contracts";

export class ImportIndexImpl implements IImportIndex {
  private readonly importsMap = new Map<string, SemanticEdge[]>();
  private readonly importedByMap = new Map<string, SemanticEdge[]>();

  constructor(edges: readonly SemanticEdge[]) {
    for (const edge of edges) {
      if (edge.type !== "imports") continue;

      // What this file imports (outgoing)
      const sourceFile = edge.file ?? edge.source;
      const impArr = this.importsMap.get(sourceFile) ?? [];
      impArr.push(edge);
      this.importsMap.set(sourceFile, impArr);

      // Who imports this file (incoming) — target is a file path
      const targetFile = edge.target;
      const byArr = this.importedByMap.get(targetFile) ?? [];
      byArr.push(edge);
      this.importedByMap.set(targetFile, byArr);
    }
  }

  /** What this file imports */
  importsByFile(file: string): SemanticEdge[] {
    return this.importsMap.get(file) ?? [];
  }

  /** Who imports this file */
  importedByFile(file: string): SemanticEdge[] {
    return this.importedByMap.get(file) ?? [];
  }

  /** Transitive import chain — all files reachable from this file via imports */
  importChain(file: string): string[] {
    const result: string[] = [];
    const visited = new Set<string>([file]);
    const queue: string[] = [file];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const edges = this.importsMap.get(current) ?? [];

      for (const edge of edges) {
        const target = edge.target;
        if (visited.has(target)) continue;
        visited.add(target);
        result.push(target);
        queue.push(target);
      }
    }

    return result;
  }
}
