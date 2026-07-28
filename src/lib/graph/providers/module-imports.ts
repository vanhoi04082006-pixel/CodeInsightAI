// CodeInsight AI — Graph Provider: Module Imports
//
// Source: CodeGraphSnapshot.
//
// Filter:
//   - Edges: type === "imports"
//   - Nodes: file + module nodes referenced by any retained edge
//
// This is the file-level dependency view — useful for spotting circular
// imports, god modules, and layering violations.

import type { GraphData, GraphProvider } from "../types";
import {
  loadCodeGraph,
  filterGraph,
  buildGraphData,
} from "./_shared";

export const moduleImportsProvider: GraphProvider = {
  type: "module-imports",

  async load(analysisId: string): Promise<GraphData> {
    const graph = await loadCodeGraph(analysisId);
    if (!graph) {
      return buildGraphData("module-imports", [], []);
    }

    // Seed with all file + module nodes — even files with no incoming or
    // outgoing imports should appear (isolated leaf files matter for the
    // "coupling" picture).
    const seedNodeIds = new Set<string>();
    for (const n of graph.nodes) {
      if (n.type === "file" || n.type === "module") {
        seedNodeIds.add(n.id);
      }
    }

    const { nodes, edges } = filterGraph(graph, ["imports"], seedNodeIds);

    return buildGraphData("module-imports", nodes, edges);
  },
};
