// CodeInsight AI — Graph Provider: Call Graph
//
// Source: CodeGraphSnapshot (loaded from DB, fallback to buildCodeGraph).
//
// Filter:
//   - Edges: type === "calls"
//   - Nodes: function + file nodes referenced by any retained edge
//
// This is the "who calls whom" view — answers questions like:
//   - What's the call chain leading to function X?
//   - Which functions have no callers (dead code)?
//   - Where are the recursive call cycles?

import type { GraphData, GraphProvider } from "../types";
import {
  loadCodeGraph,
  filterGraph,
  buildGraphData,
} from "./_shared";

export const callGraphProvider: GraphProvider = {
  type: "call-graph",

  async load(analysisId: string): Promise<GraphData> {
    const graph = await loadCodeGraph(analysisId);
    if (!graph) {
      return buildGraphData("call-graph", [], []);
    }

    // Keep all "calls" edges, then keep only nodes they touch.
    // We additionally seed the node set with function nodes (even if they
    // have no calls edges) so isolated dead-code candidates remain visible.
    const seedNodeIds = new Set<string>();
    for (const n of graph.nodes) {
      if (n.type === "function") seedNodeIds.add(n.id);
    }

    const { nodes, edges } = filterGraph(graph, ["calls"], seedNodeIds);

    // Prune any seeded function nodes that ended up with zero degree — keeps
    // the visualization focused. (UI can request "show dead code" separately
    // via the search API if needed.)
    const touched = new Set<string>();
    for (const e of edges) {
      touched.add(e.from);
      touched.add(e.to);
    }
    const prunedNodes = nodes.filter((n) => touched.has(n.id));

    return buildGraphData("call-graph", prunedNodes, edges);
  },
};
