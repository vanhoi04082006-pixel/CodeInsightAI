// CodeInsight AI — Graph Provider: Dependencies
//
// Source: AnalysisReport.dependencies (static analyzer output).
//
// The analyzer already produces a layout-positioned node/edge graph at the
// module/service granularity (not file granularity). This provider
// converts it into the normalized `GraphData` shape and surfaces the
// pre-computed circular dependency list as `stats.circularDeps`.

import type { AnalysisReport, DependencyNode, DependencyEdge } from "@/lib/types";
import type { GraphData, GraphNode, GraphEdge, GraphProvider } from "../types";
import { buildGraphData } from "./_shared";

function toNode(n: DependencyNode): GraphNode {
  return {
    id: n.id,
    type: n.type, // core | service | util | component | config | entry
    label: n.label,
    metadata: {
      group: n.group,
      size: n.size,
      x: n.x,
      y: n.y,
    },
  };
}

function toEdge(e: DependencyEdge): GraphEdge {
  return {
    from: e.from,
    to: e.to,
    type: "depends_on",
    weight: e.weight,
    metadata: {
      circular: e.circular,
    },
  };
}

export const dependencyProvider: GraphProvider = {
  type: "dependencies",

  async load(_analysisId: string, report: AnalysisReport): Promise<GraphData> {
    const deps = report?.dependencies;
    if (!deps || !Array.isArray(deps.nodes) || !Array.isArray(deps.edges)) {
      // Empty graph — still return a valid GraphData so the UI doesn't crash.
      return buildGraphData("dependencies", [], []);
    }

    const nodes = deps.nodes.map(toNode);
    const edges = deps.edges.map(toEdge);

    // Mark circular nodes so the renderer can highlight them.
    const circularIds = new Set<string>();
    for (const c of deps.circular ?? []) {
      for (const id of c.nodes) circularIds.add(id);
    }
    for (const n of nodes) {
      if (circularIds.has(n.id)) {
        n.metadata.circular = true;
      }
    }

    // Pre-computed cycles from the analyzer — pass through directly so the
    // stats panel shows the exact same cycles the dependency-graph renderer
    // highlights in red.
    const precomputedCycles = (deps.circular ?? []).map((c) => c.nodes);

    return buildGraphData("dependencies", nodes, edges, precomputedCycles);
  },
};
