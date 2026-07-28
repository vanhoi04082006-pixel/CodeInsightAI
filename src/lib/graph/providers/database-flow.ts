// CodeInsight AI — Graph Provider: Database Flow
//
// Source: CodeGraphSnapshot.
//
// Build a view of database access paths:
//   - Nodes: functions + files whose label or filePath contains a DB-related
//     keyword (query, db, database, sql, model, schema).
//   - Edges: `calls` edges between any two retained nodes.
//
// Useful for: query hotspot detection, N+1 pattern spotting, missing
// transaction boundaries, and schema-coupling analysis.

import type { CodeGraphNode } from "@/lib/codegraph/builder";
import type { GraphData, GraphNode, GraphEdge, GraphProvider } from "../types";
import {
  loadCodeGraph,
  toGraphNode,
  toGraphEdge,
  buildGraphData,
} from "./_shared";

const DB_KEYWORDS = [
  "query",
  "db",
  "database",
  "sql",
  "model",
  "schema",
];

/** True if label or filePath contains any DB keyword (case-insensitive). */
function isDbRelated(label: string, filePath?: string): boolean {
  const haystack = `${label}\u0000${filePath ?? ""}`.toLowerCase();
  for (const kw of DB_KEYWORDS) {
    if (haystack.includes(kw)) return true;
  }
  return false;
}

export const databaseFlowProvider: GraphProvider = {
  type: "database-flow",

  async load(analysisId: string): Promise<GraphData> {
    const graph = await loadCodeGraph(analysisId);
    if (!graph) {
      return buildGraphData("database-flow", [], []);
    }

    // (1) Keep only function/file nodes whose label or path looks DB-related.
    const keepIds = new Set<string>();
    const nodeById = new Map<string, CodeGraphNode>();
    for (const n of graph.nodes) {
      nodeById.set(n.id, n);
      if (n.type === "function" || n.type === "file") {
        if (isDbRelated(n.label, n.filePath)) {
          keepIds.add(n.id);
        }
      }
    }

    if (keepIds.size === 0) {
      return buildGraphData("database-flow", [], []);
    }

    // (2) Edges: `calls` edges where BOTH endpoints are DB-related.
    const edges: GraphEdge[] = [];
    for (const e of graph.edges) {
      if (e.type !== "calls") continue;
      if (keepIds.has(e.from) && keepIds.has(e.to)) {
        edges.push(toGraphEdge(e));
      }
    }

    // (3) Prune DB-related nodes that have no edges (keep the picture dense).
    // Exception: keep file nodes even if isolated — they're useful context.
    const touched = new Set<string>();
    for (const e of edges) {
      touched.add(e.from);
      touched.add(e.to);
    }
    const nodes: GraphNode[] = [];
    for (const id of keepIds) {
      const n = nodeById.get(id);
      if (!n) continue;
      if (n.type === "file" || touched.has(id)) {
        nodes.push(toGraphNode(n));
      }
    }

    return buildGraphData("database-flow", nodes, edges);
  },
};
