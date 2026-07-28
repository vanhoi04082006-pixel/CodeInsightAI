// CodeInsight AI — Graph Providers: shared helpers
//
// Internal utilities used by every snapshot-based provider (call-graph,
// class-hierarchy, module-imports, api-flow, database-flow). NOT part of
// the public API — imported only by sibling provider files.
//
// Responsibilities:
//   1. loadCodeGraph(analysisId) — fetch CodeGraphSnapshot from DB; fall
//      back to rebuilding from Analysis.parsedData via buildCodeGraph.
//   2. computeStats(...)        — derive GraphStats from nodes + edges.
//   3. buildGraphData(...)      — wrap nodes/edges/type into a GraphData.

import { db } from "@/lib/db";
import {
  buildCodeGraph,
  type CodeGraph,
  type CodeGraphNode,
  type CodeGraphEdge,
} from "@/lib/codegraph/builder";
import type {
  GraphData,
  GraphNode,
  GraphEdge,
  GraphStats,
  GraphType,
} from "../types";

/* ───────────────────────── Snapshot loading ───────────────────────── */

/**
 * Load the CodeGraph for a given analysis. Tries the persisted snapshot
 * first; falls back to rebuilding from `Analysis.parsedData` (legacy
 * analyses without a snapshot row). Returns null if neither is available.
 */
export async function loadCodeGraph(
  analysisId: string,
): Promise<CodeGraph | null> {
  // (1) Snapshot row — fast path
  try {
    const snapshot = await db.codeGraphSnapshot.findUnique({
      where: { analysisId },
    });
    if (snapshot) {
      return JSON.parse(snapshot.graph) as CodeGraph;
    }
  } catch {
    /* ignore — fall through to rebuild */
  }

  // (2) Rebuild from parsedData
  try {
    const analysis = await db.analysis.findUnique({
      where: { id: analysisId },
      select: { parsedData: true },
    });
    if (analysis?.parsedData) {
      const parsed = JSON.parse(analysis.parsedData);
      if (parsed?.files) {
        return buildCodeGraph(parsed);
      }
    }
  } catch {
    /* ignore */
  }

  return null;
}

/* ───────────────────────── Normalization ───────────────────────── */

/** Coerce a CodeGraphNode into the normalized GraphNode shape. */
export function toGraphNode(n: CodeGraphNode): GraphNode {
  return {
    id: n.id,
    type: n.type,
    label: n.label,
    filePath: n.filePath,
    language: n.language,
    startLine: n.startLine,
    endLine: n.endLine,
    metadata: { ...n.metadata },
  };
}

/** Coerce a CodeGraphEdge into the normalized GraphEdge shape. */
export function toGraphEdge(e: CodeGraphEdge): GraphEdge {
  return {
    from: e.from,
    to: e.to,
    type: e.type,
    weight: e.weight,
    metadata: e.metadata ? { ...e.metadata } : undefined,
  };
}

/* ───────────────────────── Stats ───────────────────────── */

/**
 * Compute GraphStats for a set of nodes + edges.
 *
 * @param nodes            Final node list for this graph.
 * @param edges            Final edge list for this graph.
 * @param precomputedCycles  Optional pre-detected cycles (e.g. from
 *                           `report.dependencies.circular`). When omitted,
 *                           a DFS pass runs here.
 */
export function computeStats(
  nodes: GraphNode[],
  edges: GraphEdge[],
  precomputedCycles?: string[][],
): GraphStats {
  const byNodeType: Record<string, number> = {};
  const byEdgeType: Record<string, number> = {};

  for (const n of nodes) {
    byNodeType[n.type] = (byNodeType[n.type] || 0) + 1;
  }
  for (const e of edges) {
    byEdgeType[e.type] = (byEdgeType[e.type] || 0) + 1;
  }

  const circularDeps =
    precomputedCycles ?? detectCycles(nodes, edges);

  const avgConnectivity =
    nodes.length > 0 ? (2 * edges.length) / nodes.length : 0;

  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    byNodeType,
    byEdgeType,
    circularDeps,
    avgConnectivity: Number(avgConnectivity.toFixed(2)),
  };
}

/**
 * Wrap nodes/edges/type into a GraphData with computed stats.
 */
export function buildGraphData(
  type: GraphType,
  nodes: GraphNode[],
  edges: GraphEdge[],
  precomputedCycles?: string[][],
): GraphData {
  return {
    nodes,
    edges,
    type,
    stats: computeStats(nodes, edges, precomputedCycles),
  };
}

/* ───────────────────────── Cycle detection (DFS) ───────────────────────── */

/**
 * 3-color DFS cycle detection. Returns each cycle as the list of node ids
 * in walk order (last node has an edge back to the first). Deduplicated by
 * a canonical sorted-id key so the same cycle isn't reported twice.
 *
 * This mirrors `GraphService.findCircularDependencies` but is available at
 * provider build time so stats can be precomputed (and so providers that
 * receive a pre-computed cycle list from their source can skip it).
 */
export function detectCycles(
  nodes: GraphNode[],
  edges: GraphEdge[],
): string[][] {
  const outAdj = new Map<string, string[]>();
  const nodeIds = new Set<string>();
  for (const n of nodes) {
    nodeIds.add(n.id);
    outAdj.set(n.id, []);
  }
  for (const e of edges) {
    if (nodeIds.has(e.from) && nodeIds.has(e.to)) {
      outAdj.get(e.from)!.push(e.to);
    }
  }

  const WHITE = 0,
    GREY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  for (const id of nodeIds) color.set(id, WHITE);

  const stack: string[] = [];
  const cycles: string[][] = [];
  const seen = new Set<string>();

  const dfs = (u: string) => {
    color.set(u, GREY);
    stack.push(u);
    for (const v of outAdj.get(u) ?? []) {
      const c = color.get(v);
      if (c === GREY) {
        const idx = stack.indexOf(v);
        if (idx >= 0) {
          const cycle = stack.slice(idx);
          const key = [...cycle].sort().join("|");
          if (!seen.has(key)) {
            seen.add(key);
            cycles.push(cycle);
          }
        }
      } else if (c === WHITE) {
        dfs(v);
      }
    }
    stack.pop();
    color.set(u, BLACK);
  };

  for (const id of nodeIds) {
    if (color.get(id) === WHITE) dfs(id);
  }

  return cycles;
}

/* ───────────────────────── Edge filter helper ───────────────────────── */

/**
 * Subset a CodeGraph to only the given edge types, then keep only nodes
 * referenced by at least one retained edge (optionally also keep a set of
 * explicitly seeded node ids).
 */
export function filterGraph(
  graph: CodeGraph,
  edgeTypes: string[],
  seedNodeIds?: Set<string>,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const wanted = new Set(edgeTypes);
  const edges: GraphEdge[] = [];
  const keepIds = new Set<string>(seedNodeIds ?? []);

  for (const e of graph.edges) {
    if (!wanted.has(e.type)) continue;
    edges.push(toGraphEdge(e));
    keepIds.add(e.from);
    keepIds.add(e.to);
  }

  const nodes: GraphNode[] = [];
  for (const n of graph.nodes) {
    if (keepIds.has(n.id)) nodes.push(toGraphNode(n));
  }

  return { nodes, edges };
}
