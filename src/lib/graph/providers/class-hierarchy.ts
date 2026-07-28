// CodeInsight AI — Graph Provider: Class Hierarchy
//
// Source: CodeGraphSnapshot.
//
// Filter:
//   - Edges: type === "extends" or "implements"
//   - Nodes: class nodes referenced by any retained edge
//
// Surfaces inheritance relationships — useful for spotting deep chains,
// wide interfaces, and Liskov substitution risk.

import type { GraphData, GraphProvider } from "../types";
import {
  loadCodeGraph,
  filterGraph,
  buildGraphData,
} from "./_shared";

export const classHierarchyProvider: GraphProvider = {
  type: "class-hierarchy",

  async load(analysisId: string): Promise<GraphData> {
    const graph = await loadCodeGraph(analysisId);
    if (!graph) {
      return buildGraphData("class-hierarchy", [], []);
    }

    // Seed with all class nodes (so a class with no inheritance edges still
    // appears as a leaf/root in the hierarchy view).
    const seedNodeIds = new Set<string>();
    for (const n of graph.nodes) {
      if (n.type === "class") seedNodeIds.add(n.id);
    }

    const { nodes, edges } = filterGraph(
      graph,
      ["extends", "implements"],
      seedNodeIds,
    );

    return buildGraphData("class-hierarchy", nodes, edges);
  },
};
