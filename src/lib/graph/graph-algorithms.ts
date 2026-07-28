// CodeInsight AI — Graph Algorithms
// Pure graph algorithms: cycles, paths, impact, traversal.
// Separated from GraphService for Single Responsibility.

import type { GraphNode, GraphEdge, GraphData } from "./types";

export class GraphAlgorithms {
  private readonly data: GraphData;
  private readonly outEdges: Map<string, GraphEdge[]>;
  private readonly inEdges: Map<string, GraphEdge[]>;
  private readonly nodeById: Map<string, GraphNode>;

  constructor(data: GraphData) {
    this.data = data;
    this.outEdges = new Map();
    this.inEdges = new Map();
    this.nodeById = new Map();

    for (const n of data.nodes) this.nodeById.set(n.id, n);
    for (const e of data.edges) {
      const out = this.outEdges.get(e.from) ?? [];
      out.push(e);
      this.outEdges.set(e.from, out);

      const inc = this.inEdges.get(e.to) ?? [];
      inc.push(e);
      this.inEdges.set(e.to, inc);
    }
  }

  /** Get node by id */
  findNode(id: string): GraphNode | undefined {
    return this.nodeById.get(id);
  }

  /** Get incoming + outgoing neighbors */
  findNeighbors(id: string): { incoming: GraphNode[]; outgoing: GraphNode[] } {
    const incomingIds = new Set<string>();
    for (const e of this.inEdges.get(id) ?? []) incomingIds.add(e.from);
    const outgoingIds = new Set<string>();
    for (const e of this.outEdges.get(id) ?? []) outgoingIds.add(e.to);
    return {
      incoming: [...incomingIds].map(id => this.nodeById.get(id)).filter(Boolean) as GraphNode[],
      outgoing: [...outgoingIds].map(id => this.nodeById.get(id)).filter(Boolean) as GraphNode[],
    };
  }

  /** Reverse-BFS: what breaks if this node changes? */
  findImpact(nodeId: string): GraphNode[] {
    if (!this.nodeById.has(nodeId)) return [];
    const visited = new Set<string>([nodeId]);
    const queue: string[] = [nodeId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const e of this.inEdges.get(cur) ?? []) {
        if (!visited.has(e.from)) {
          visited.add(e.from);
          queue.push(e.from);
        }
      }
    }
    visited.delete(nodeId);
    return [...visited].map(id => this.nodeById.get(id)).filter(Boolean) as GraphNode[];
  }

  /** BFS shortest path */
  findShortestPath(fromId: string, toId: string): GraphNode[] | null {
    if (!this.nodeById.has(fromId) || !this.nodeById.has(toId)) return null;
    if (fromId === toId) return [this.nodeById.get(fromId)!];
    const visited = new Set<string>([fromId]);
    const queue: Array<{ id: string; path: string[] }> = [{ id: fromId, path: [fromId] }];
    while (queue.length > 0) {
      const { id, path } = queue.shift()!;
      for (const e of this.outEdges.get(id) ?? []) {
        if (visited.has(e.to)) continue;
        const nextPath = [...path, e.to];
        if (e.to === toId) {
          return nextPath.map(id => this.nodeById.get(id)).filter(Boolean) as GraphNode[];
        }
        visited.add(e.to);
        queue.push({ id: e.to, path: nextPath });
      }
    }
    return null;
  }

  /** DFS cycle detection — returns array of cycles (each is a list of node ids) */
  findCircularDependencies(): string[][] {
    const WHITE = 0, GREY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const n of this.data.nodes) color.set(n.id, WHITE);
    const stack: string[] = [];
    const cycles: string[][] = [];
    const seen = new Set<string>();

    const dfs = (u: string) => {
      color.set(u, GREY);
      stack.push(u);
      for (const e of this.outEdges.get(u) ?? []) {
        const v = e.to;
        if (!color.has(v)) continue;
        const c = color.get(v);
        if (c === GREY) {
          const idx = stack.indexOf(v);
          if (idx >= 0) {
            const cycle = stack.slice(idx);
            const key = [...cycle].sort().join("|");
            if (!seen.has(key)) { seen.add(key); cycles.push(cycle); }
          }
        } else if (c === WHITE) {
          dfs(v);
        }
      }
      stack.pop();
      color.set(u, BLACK);
    };

    for (const n of this.data.nodes) {
      if (color.get(n.id) === WHITE) dfs(n.id);
    }
    return cycles;
  }

  /** Get all edges (for stats) */
  getEdges(): GraphEdge[] { return this.data.edges; }
  /** Get all nodes (for stats) */
  getNodes(): GraphNode[] { return this.data.nodes; }
  /** Get incoming edges for a node */
  getIncoming(id: string): GraphEdge[] { return this.inEdges.get(id) ?? []; }
  /** Get outgoing edges for a node */
  getOutgoing(id: string): GraphEdge[] { return this.outEdges.get(id) ?? []; }
}
