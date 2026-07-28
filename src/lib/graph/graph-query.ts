// CodeInsight AI — Graph Query API
// Semantic query language for AI Agents — not just string search.
//
// Examples:
//   graph.query({ type: "function" })                    → all functions
//   graph.query({ type: "function", calledBy: "login" })  → functions called by login()
//   graph.query({ route: "/api/auth" })                   → nodes on /api/auth route
//   graph.query({ database: "users" })                    → nodes touching users table
//   graph.query({ filePath: "src/auth.ts" })              → all nodes in auth.ts
//   graph.query({ label: "verifyJWT" })                   → exact symbol match
//   graph.query({ type: "class", extends: "BaseService" })→ classes extending BaseService

import type { GraphNode, GraphEdge, GraphData } from "./types";
import { GraphIndex } from "./graph-index";
import { GraphAlgorithms } from "./graph-algorithms";

export interface GraphQueryFilter {
  /** Node type filter: "file" | "function" | "class" | "module" | "route" | "table" | "service" */
  type?: string;
  /** Exact symbol name (case-insensitive) — uses GraphIndex O(1) */
  label?: string;
  /** File path filter — returns all nodes in that file */
  filePath?: string;
  /** Find nodes called BY this symbol (incoming "calls" edges) */
  calledBy?: string;
  /** Find nodes that CALL this symbol (outgoing "calls" edges) */
  calls?: string;
  /** Find classes that extend this base class */
  extends?: string;
  /** Find classes that implement this interface */
  implements?: string;
  /** Find nodes on a specific API route */
  route?: string;
  /** Find nodes related to a database table */
  database?: string;
  /** Min connectivity (in + out degree) */
  minDegree?: number;
  /** Limit results */
  limit?: number;
}

export interface GraphQueryResult {
  nodes: GraphNode[];
  totalCount: number;
  filter: GraphQueryFilter;
}

export class GraphQuery {
  private readonly data: GraphData;
  private readonly index: GraphIndex;
  private readonly algorithms: GraphAlgorithms;

  constructor(data: GraphData, index: GraphIndex, algorithms: GraphAlgorithms) {
    this.data = data;
    this.index = index;
    this.algorithms = algorithms;
  }

  /**
   * Semantic query — filter nodes by multiple criteria.
   * All filters are AND-combined.
   */
  query(filter: GraphQueryFilter): GraphQueryResult {
    let candidates: GraphNode[] = [];

    // Step 1: Get initial candidate set (use index when possible for O(1))
    if (filter.label) {
      candidates = this.index.findSymbol(filter.label);
    } else if (filter.filePath) {
      candidates = this.index.findByFile(filter.filePath);
    } else if (filter.route) {
      // Find route nodes matching the path
      candidates = this.data.nodes.filter(n =>
        n.type === "route" && n.label.toLowerCase().includes(filter.route!.toLowerCase())
      );
    } else if (filter.database) {
      // Find nodes with DB-related names
      const dbKeywords = ["query", "db", "database", "sql", "model", "schema", "table"];
      const q = filter.database.toLowerCase();
      candidates = this.data.nodes.filter(n =>
        n.label.toLowerCase().includes(q) ||
        (n.filePath?.toLowerCase().includes(q) ?? false) ||
        dbKeywords.some(kw => n.label.toLowerCase().includes(kw))
      );
    } else {
      // Start with all nodes
      candidates = this.data.nodes;
    }

    // Step 2: Apply filters
    if (filter.type) {
      candidates = candidates.filter(n => n.type === filter.type);
    }

    if (filter.calledBy) {
      // Find nodes that are called BY the given symbol
      const callers = this.index.findSymbol(filter.calledBy);
      const callerIds = new Set(callers.map(c => c.id));
      candidates = candidates.filter(n => {
        // Check if any caller has an outgoing "calls" edge to this node
        for (const callerId of callerIds) {
          const neighbors = this.algorithms.findNeighbors(callerId);
          if (neighbors.outgoing.some(out => out.id === n.id)) return true;
        }
        return false;
      });
    }

    if (filter.calls) {
      // Find nodes that CALL the given symbol
      const targets = this.index.findSymbol(filter.calls);
      const targetIds = new Set(targets.map(t => t.id));
      candidates = candidates.filter(n => {
        const neighbors = this.algorithms.findNeighbors(n.id);
        return neighbors.outgoing.some(out => targetIds.has(out.id));
      });
    }

    if (filter.extends) {
      // Find classes that extend the given base class
      const baseClasses = this.index.findSymbol(filter.extends);
      const baseIds = new Set(baseClasses.map(b => b.id));
      candidates = candidates.filter(n => {
        const neighbors = this.algorithms.findNeighbors(n.id);
        return neighbors.outgoing.some(out =>
          baseIds.has(out.id) && this.data.edges.some(e =>
            e.from === n.id && e.to === out.id && e.type === "extends"
          )
        );
      });
    }

    if (filter.implements) {
      const interfaces = this.index.findSymbol(filter.implements);
      const ifaceIds = new Set(interfaces.map(i => i.id));
      candidates = candidates.filter(n => {
        const neighbors = this.algorithms.findNeighbors(n.id);
        return neighbors.outgoing.some(out =>
          ifaceIds.has(out.id) && this.data.edges.some(e =>
            e.from === n.id && e.to === out.id && e.type === "implements"
          )
        );
      });
    }

    if (filter.minDegree !== undefined) {
      candidates = candidates.filter(n => {
        const neighbors = this.algorithms.findNeighbors(n.id);
        return (neighbors.incoming.length + neighbors.outgoing.length) >= filter.minDegree!;
      });
    }

    // Step 3: Apply limit
    const limit = filter.limit ?? 50;
    const limited = candidates.slice(0, limit);

    return {
      nodes: limited,
      totalCount: candidates.length,
      filter,
    };
  }

  /**
   * Quick helper: find a single symbol by name (first match).
   */
  findSymbol(name: string): GraphNode | undefined {
    return this.index.findSymbol(name)[0];
  }

  /**
   * Quick helper: find all symbols by name.
   */
  findSymbols(name: string): GraphNode[] {
    return this.index.findSymbol(name);
  }
}
