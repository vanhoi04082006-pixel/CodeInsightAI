// CodeInsight AI — Graph Provider: API Flow
//
// Source: CodeGraphSnapshot.
//
// Build a request-flow view centered on API endpoints:
//   - Nodes: all `route` nodes, plus their direct callers (one-hop back
//     over `calls` edges) and direct callees (one-hop forward over
//     `calls` edges — the handlers/services they invoke).
//   - Edges: `calls` edges between any of the above nodes, plus `imports`
//     edges between route-handler files (file-level coupling between
//     endpoint modules).
//
// Useful for spotting: most-called endpoints (high fan-in), N+1 query
// patterns (route → many DB calls), and middleware/handler coupling.

import type { CodeGraphNode } from "@/lib/codegraph/builder";
import type { GraphData, GraphNode, GraphEdge, GraphProvider } from "../types";
import {
  loadCodeGraph,
  toGraphNode,
  toGraphEdge,
  buildGraphData,
} from "./_shared";

export const apiFlowProvider: GraphProvider = {
  type: "api-flow",

  async load(analysisId: string): Promise<GraphData> {
    const graph = await loadCodeGraph(analysisId);
    if (!graph) {
      return buildGraphData("api-flow", [], []);
    }

    const nodeById = new Map<string, CodeGraphNode>();
    for (const n of graph.nodes) nodeById.set(n.id, n);

    // (1) Seed: all route nodes.
    const routeNodeIds = new Set<string>();
    const routeFilePaths = new Set<string>();
    for (const n of graph.nodes) {
      if (n.type === "route") {
        routeNodeIds.add(n.id);
        if (n.filePath) routeFilePaths.add(n.filePath);
      }
    }

    if (routeNodeIds.size === 0) {
      return buildGraphData("api-flow", [], []);
    }

    // (2) One-hop neighbors over `calls` edges (both directions).
    const keepIds = new Set<string>(routeNodeIds);
    for (const e of graph.edges) {
      if (e.type !== "calls") continue;
      if (routeNodeIds.has(e.to)) keepIds.add(e.from); // caller of a route
      if (routeNodeIds.has(e.from)) keepIds.add(e.to); // callee of a route
    }

    // (3) Edges: `calls` edges where either endpoint is in keepIds, plus
    // `imports` edges between route-handler files.
    const edges: GraphEdge[] = [];
    const fileNodeIdByPath = new Map<string, string>();
    for (const n of graph.nodes) {
      if (n.type === "file" && n.filePath) {
        fileNodeIdByPath.set(n.filePath, n.id);
      }
    }

    for (const e of graph.edges) {
      if (e.type === "calls") {
        if (keepIds.has(e.from) && keepIds.has(e.to)) {
          edges.push(toGraphEdge(e));
        }
        continue;
      }
      if (e.type === "imports") {
        // Only imports where BOTH endpoints are route-handler files.
        const fromNode = nodeById.get(e.from);
        const toNode = nodeById.get(e.to);
        if (
          fromNode?.type === "file" &&
          toNode?.type === "file" &&
          routeFilePaths.has(fromNode.filePath ?? "") &&
          routeFilePaths.has(toNode.filePath ?? "")
        ) {
          edges.push(toGraphEdge(e));
          keepIds.add(e.from);
          keepIds.add(e.to);
        }
      }
    }

    // (4) Build node list from keepIds (routes + callers + callees +
    // route-handler files involved in cross-route imports).
    const nodes: GraphNode[] = [];
    for (const id of keepIds) {
      const n = nodeById.get(id);
      if (n) nodes.push(toGraphNode(n));
    }

    return buildGraphData("api-flow", nodes, edges);
  },
};
