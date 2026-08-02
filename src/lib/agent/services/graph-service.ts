// CodeInsight AI — Graph Service (Layer 3)
// Wraps the existing Graph Engine (src/lib/graph/) behind the Service interface.
// Accepts SPM, converts to GraphData internally, delegates to GraphService.

import type {
  SemanticProjectModel,
  GraphService as IGraphService,
  GraphData,
  GraphStats,
  Result,
  AgentError,
} from "../contracts";
import { buildIndexes } from "../indexes";

export class GraphServiceImpl implements IGraphService {
  private cachedGraphData: GraphData | null = null;
  private cachedSpmId: string | null = null;

  /**
   * Build graph data from SPM.
   * Converts SPM files → graph nodes, SPM edges → graph edges.
   * Result is cached per SPM ID.
   */
  buildGraph(spm: SemanticProjectModel): Result<GraphData> {
    try {
      // Return cached if same SPM
      if (this.cachedSpmId === spm.id && this.cachedGraphData) {
        return ok(this.cachedGraphData);
      }

      const nodes = spm.files.map((f) => ({
        id: f.path,
        label: f.path.split("/").pop() || f.path,
        type: f.language,
        group: 0,
        x: 0,
        y: 0,
        size: Math.max(5, Math.min(20, f.lines / 10)),
      }));

      const edges = spm.edges.map((e) => ({
        from: e.source,
        to: e.target,
        weight: 1,
        type: e.type,
      }));

      this.cachedGraphData = { nodes, edges };
      this.cachedSpmId = spm.id;

      return ok({ nodes, edges });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Failed to build graph: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Find shortest path between two nodes using the PathIndex (BFS). */
  findPath(from: string, to: string): Result<string[] | null> {
    if (!this.cachedGraphData) {
      return err("SPM_NOT_INITIALIZED", "Graph not built — call buildGraph first");
    }
    // Use simple BFS on cached edges
    const adjacency = new Map<string, Set<string>>();
    for (const edge of this.cachedGraphData.edges as any[]) {
      const neighbors = adjacency.get(edge.from) ?? new Set<string>();
      neighbors.add(edge.to);
      adjacency.set(edge.from, neighbors);
    }

    const visited = new Set<string>([from]);
    const queue: { node: string; path: string[] }[] = [{ node: from, path: [from] }];

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;
      const neighbors = adjacency.get(node);
      if (neighbors) {
        for (const n of neighbors) {
          if (n === to) return ok([...path, n]);
          if (!visited.has(n)) {
            visited.add(n);
            queue.push({ node: n, path: [...path, n] });
          }
        }
      }
    }
    return ok(null);
  }

  /** Find all cycles using Tarjan's algorithm on cached graph. */
  findCycles(): Result<string[][]> {
    if (!this.cachedGraphData) {
      return err("SPM_NOT_INITIALIZED", "Graph not built — call buildGraph first");
    }
    // Build adjacency list
    const adjacency = new Map<string, Set<string>>();
    const nodes = new Set<string>();
    for (const edge of this.cachedGraphData.edges as any[]) {
      nodes.add(edge.from);
      nodes.add(edge.to);
      const neighbors = adjacency.get(edge.from) ?? new Set<string>();
      neighbors.add(edge.to);
      adjacency.set(edge.from, neighbors);
    }

    // Tarjan's SCC
    const cycles: string[][] = [];
    let index = 0;
    const stack: string[] = [];
    const onStack = new Set<string>();
    const indices = new Map<string, number>();
    const lowLinks = new Map<string, number>();

    const strongConnect = (v: string) => {
      indices.set(v, index);
      lowLinks.set(v, index);
      index++;
      stack.push(v);
      onStack.add(v);

      const neighbors = adjacency.get(v);
      if (neighbors) {
        for (const w of neighbors) {
          if (!indices.has(w)) {
            strongConnect(w);
            lowLinks.set(v, Math.min(lowLinks.get(v)!, lowLinks.get(w)!));
          } else if (onStack.has(w)) {
            lowLinks.set(v, Math.min(lowLinks.get(v)!, indices.get(w)!));
          }
        }
      }

      if (lowLinks.get(v) === indices.get(v)) {
        const scc: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
        } while (w !== v);
        if (scc.length > 1) cycles.push(scc);
      }
    };

    for (const node of nodes) {
      if (!indices.has(node)) strongConnect(node);
    }

    return ok(cycles);
  }

  /** Compute graph statistics. */
  getStats(): Result<GraphStats> {
    if (!this.cachedGraphData) {
      return err("SPM_NOT_INITIALIZED", "Graph not built — call buildGraph first");
    }
    const totalNodes = this.cachedGraphData.nodes.length;
    const totalEdges = this.cachedGraphData.edges.length;
    const avgConnectivity = totalNodes > 0 ? (totalEdges / totalNodes) * 2 : 0;

    return ok({ totalNodes, totalEdges, avgConnectivity });
  }
}

// ─── Helpers ───

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function err(code: string, message: string): { ok: false; error: AgentError } {
  return { ok: false, error: { code, message, recoverable: false } };
}
