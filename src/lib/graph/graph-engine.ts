// CodeInsight AI — Unified Graph Engine
//
// `GraphService` is the single query entry-point for all 6 graph types.
// Each provider (dependency, call-graph, class-hierarchy, module-imports,
// api-flow, database-flow) normalizes its data source into `GraphData`,
// then a `GraphService` instance handles every UI query:
//
//   findNode / findNeighbors / getInspector        — node detail panel
//   findImpact (BFS)                               — "what breaks if I change X?"
//   findShortestPath (BFS)                         — trace between two nodes
//   findCircularDependencies (DFS, Johnson-ish)    — cycle report
//   search                                         — fuzzy node search
//   getStats / getTopNodes                         — summary panel
//   getAIConfig                                    — type-specific AI prompt
//
// The engine is pure: it never touches the DB or the filesystem. Providers
// own all I/O; the engine only walks the in-memory graph.

import type {
  GraphData,
  GraphNode,
  GraphEdge,
  GraphStats,
  InspectorData,
  GraphAIConfig,
  GraphType,
} from "./types";

export class GraphService {
  /** Underlying normalized graph (immutable from the engine's perspective). */
  readonly data: GraphData;

  /** Adjacency: nodeId → outgoing edges. */
  private readonly outEdges: Map<string, GraphEdge[]>;
  /** Adjacency: nodeId → incoming edges. */
  private inEdges: Map<string, GraphEdge[]>;
  /** id → node lookup. */
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

  /* ───────────────────────── Node lookup ───────────────────────── */

  findNode(id: string): GraphNode | undefined {
    return this.nodeById.get(id);
  }

  findNeighbors(id: string): { incoming: GraphNode[]; outgoing: GraphNode[] } {
    const incomingIds = new Set<string>();
    for (const e of this.inEdges.get(id) ?? []) incomingIds.add(e.from);

    const outgoingIds = new Set<string>();
    for (const e of this.outEdges.get(id) ?? []) outgoingIds.add(e.to);

    return {
      incoming: [...incomingIds]
        .map((nid) => this.nodeById.get(nid))
        .filter((n): n is GraphNode => Boolean(n)),
      outgoing: [...outgoingIds]
        .map((nid) => this.nodeById.get(nid))
        .filter((n): n is GraphNode => Boolean(n)),
    };
  }

  /**
   * Build the inspector payload for a node — used by the right-side detail
   * panel: incoming/outgoing edges (with metadata), deduplicated neighbors.
   */
  getInspector(id: string): InspectorData | null {
    const node = this.nodeById.get(id);
    if (!node) return null;

    const incoming = this.inEdges.get(id) ?? [];
    const outgoing = this.outEdges.get(id) ?? [];

    const neighborIds = new Set<string>();
    for (const e of incoming) neighborIds.add(e.from);
    for (const e of outgoing) neighborIds.add(e.to);

    const neighbors = [...neighborIds]
      .map((nid) => this.nodeById.get(nid))
      .filter((n): n is GraphNode => Boolean(n));

    return { node, incoming, outgoing, neighbors };
  }

  /* ───────────────────────── Impact analysis ───────────────────────── */

  /**
   * Reverse-BFS from `nodeId`: every node that (transitively) depends on it.
   * Answers "what breaks if I change this file/function?".
   */
  findImpact(nodeId: string): GraphNode[] {
    if (!this.nodeById.has(nodeId)) return [];

    const visited = new Set<string>([nodeId]);
    const queue: string[] = [nodeId];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      // Walk incoming edges (dependents)
      for (const e of this.inEdges.get(cur) ?? []) {
        if (!visited.has(e.from)) {
          visited.add(e.from);
          queue.push(e.from);
        }
      }
    }

    visited.delete(nodeId); // exclude the seed itself
    return [...visited]
      .map((nid) => this.nodeById.get(nid))
      .filter((n): n is GraphNode => Boolean(n));
  }

  /* ───────────────────────── Shortest path (BFS) ───────────────────────── */

  /**
   * BFS shortest path from `fromId` to `toId` over outgoing edges.
   * Returns the list of nodes along the path (including endpoints), or null
   * if no path exists.
   */
  findShortestPath(fromId: string, toId: string): GraphNode[] | null {
    if (!this.nodeById.has(fromId) || !this.nodeById.has(toId)) return null;
    if (fromId === toId) {
      const n = this.nodeById.get(fromId)!;
      return [n];
    }

    const visited = new Set<string>([fromId]);
    const queue: Array<{ id: string; path: string[] }> = [
      { id: fromId, path: [fromId] },
    ];

    while (queue.length > 0) {
      const { id, path } = queue.shift()!;
      for (const e of this.outEdges.get(id) ?? []) {
        if (visited.has(e.to)) continue;
        const nextPath = [...path, e.to];
        if (e.to === toId) {
          return nextPath
            .map((nid) => this.nodeById.get(nid))
            .filter((n): n is GraphNode => Boolean(n));
        }
        visited.add(e.to);
        queue.push({ id: e.to, path: nextPath });
      }
    }
    return null;
  }

  /* ───────────────────────── Circular dependency detection (DFS) ───────────────────────── */

  /**
   * Detect circular dependencies using DFS with a recursion stack.
   * Returns each cycle as a list of node ids in walk order (the cycle closes
   * implicitly — i.e. last node has an edge back to the first).
   *
   * Algorithm: classic 3-color DFS. When we encounter a grey node (on the
   * current stack), we extract the cycle from the stack.
   *
   * Cycles are deduplicated by a canonical key (sorted node-id join) so the
   * same cycle reported from multiple DFS roots only appears once.
   */
  findCircularDependencies(): string[][] {
    const WHITE = 0,
      GREY = 1,
      BLACK = 2;
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
        if (!color.has(v)) continue; // edge to a node not in this graph
        const c = color.get(v);
        if (c === GREY) {
          // Found a back edge → extract cycle from the stack
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

    for (const n of this.data.nodes) {
      if (color.get(n.id) === WHITE) dfs(n.id);
    }

    return cycles;
  }

  /* ───────────────────────── Search ───────────────────────── */

  /**
   * Case-insensitive substring search across label, filePath, and id.
   * Returns up to `limit` matches (default 50).
   */
  search(query: string, limit = 50): GraphNode[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: GraphNode[] = [];
    for (const n of this.data.nodes) {
      if (
        n.label.toLowerCase().includes(q) ||
        (n.filePath?.toLowerCase().includes(q) ?? false) ||
        n.id.toLowerCase().includes(q)
      ) {
        out.push(n);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  /* ───────────────────────── Stats / top-N ───────────────────────── */

  getStats(): GraphStats {
    return this.data.stats;
  }

  /**
   * Top-N nodes by total degree (in + out). Used by the "most connected"
   * summary card.
   */
  getTopNodes(limit = 10): Array<{ node: GraphNode; degree: number }> {
    const degree = new Map<string, number>();
    for (const n of this.data.nodes) degree.set(n.id, 0);
    for (const e of this.data.edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    return [...degree.entries()]
      .map(([id, d]) => ({ node: this.nodeById.get(id), degree: d }))
      .filter((x): x is { node: GraphNode; degree: number } => Boolean(x.node))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, limit);
  }

  /* ───────────────────────── AI integration ───────────────────────── */

  /**
   * Type-specific AI prompt + panel title. The prompt is appended to the
   * standard CodeInsight AI system prompt along with the serialized graph
   * summary (top nodes, stats, cycles) so the AI can reason about structure.
   */
  getAIConfig(): GraphAIConfig {
    return AI_CONFIGS[this.data.type] ?? AI_CONFIGS["dependencies"];
  }
}

/* ───────────────────────── AI prompt registry ───────────────────────── */

const AI_CONFIGS: Record<GraphType, GraphAIConfig> = {
  dependencies: {
    title: "Dependency Graph AI",
    prompt:
      "Analyze this dependency graph. Identify architectural layers, " +
      "circular dependencies, god modules, and high-coupling areas. " +
      "For each finding, cite specific node ids and propose a concrete " +
      "refactoring action that improves modularity without breaking callers.",
  },
  "call-graph": {
    title: "Call Graph AI",
    prompt:
      "Analyze this function call graph. Identify hotspots (high fan-in " +
      "and fan-out), dead code (functions with no callers), recursive call " +
      "chains, and overly deep call stacks. Recommend specific call-site " +
      "consolidations or function splits to reduce coupling.",
  },
  "class-hierarchy": {
    title: "Class Hierarchy AI",
    prompt:
      "Analyze this class inheritance graph. Identify deep inheritance " +
      "chains (depth > 3), wide interfaces (many implementors), the " +
      "abstract-vs-concrete ratio, and potential Liskov substitution " +
      "violations. Suggest where composition would be preferable to " +
      "inheritance.",
  },
  "module-imports": {
    title: "Module Imports AI",
    prompt:
      "Analyze this module import graph. Identify circular dependencies, " +
      "fan-in/fan-out imbalance, god modules (fan-in + fan-out > 20), and " +
      "layering violations. Recommend specific decoupling strategies " +
      "(barrel files, dependency injection, interface segregation).",
  },
  "api-flow": {
    title: "API Flow AI",
    prompt:
      "Analyze this API request flow graph. Identify the most-called " +
      "endpoints (high fan-in), N+1 query patterns (route → many DB calls), " +
      "slow middleware chains, and authentication/authorization " +
      "bottlenecks. Recommend caching, batching, or query optimization " +
      "strategies with expected impact.",
  },
  "database-flow": {
    title: "Database Flow AI",
    prompt:
      "Analyze this database access flow graph. Identify query hotspots " +
      "(functions called by many routes), potential N+1 query patterns, " +
      "missing transaction boundaries, and schema coupling. Propose " +
      "specific indexing, batching, or query consolidation changes.",
  },
};
