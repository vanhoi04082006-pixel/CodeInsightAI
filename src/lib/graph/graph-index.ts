// CodeInsight AI — Graph Index
// O(1) symbol lookup — Map<symbol, GraphNode[]>
// Supports multiple nodes with the same label (e.g., "login" in multiple files)

import type { GraphNode, GraphData } from "./types";

export class GraphIndex {
  /** label (lowercase) → nodes with that label */
  private readonly byLabel: Map<string, GraphNode[]>;
  /** filePath → nodes in that file */
  private readonly byFile: Map<string, GraphNode[]>;
  /** id → node (already in GraphService, but duplicated here for standalone use) */
  private readonly byId: Map<string, GraphNode>;

  constructor(data: GraphData) {
    this.byLabel = new Map();
    this.byFile = new Map();
    this.byId = new Map();

    for (const n of data.nodes) {
      // byId
      this.byId.set(n.id, n);

      // byLabel — case-insensitive
      const labelKey = n.label.toLowerCase();
      const arr = this.byLabel.get(labelKey) ?? [];
      arr.push(n);
      this.byLabel.set(labelKey, arr);

      // byFile
      if (n.filePath) {
        const fileArr = this.byFile.get(n.filePath) ?? [];
        fileArr.push(n);
        this.byFile.set(n.filePath, fileArr);
      }
    }
  }

  /** O(1) symbol lookup by label (case-insensitive). Returns all matching nodes. */
  findSymbol(label: string): GraphNode[] {
    return this.byLabel.get(label.toLowerCase()) ?? [];
  }

  /** O(1) node lookup by id. */
  findById(id: string): GraphNode | undefined {
    return this.byId.get(id);
  }

  /** O(1) lookup all symbols in a file. */
  findByFile(filePath: string): GraphNode[] {
    return this.byFile.get(filePath) ?? [];
  }

  /** O(1) check if a symbol exists. */
  hasSymbol(label: string): boolean {
    return this.byLabel.has(label.toLowerCase());
  }

  /** Get all unique labels (for autocomplete). */
  getAllLabels(): string[] {
    return [...this.byLabel.keys()];
  }
}
