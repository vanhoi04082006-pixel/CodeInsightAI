// CodeInsight AI — Unified Graph Engine (v2)
//
// Refactored per Single Responsibility Principle:
// - GraphService: thin facade — delegates to specialized modules
// - GraphIndex: O(1) symbol lookup
// - GraphAlgorithms: cycles, paths, impact, traversal
// - GraphQuery: semantic query API for AI Agents
// - GraphImpact: structured ImpactReport
// - AIAnalysisService: AI prompts (separated from engine)
//
// The engine is pure: it never touches the DB or the filesystem.

import type { GraphData, GraphNode, GraphEdge, GraphStats, InspectorData } from "./types";
import { GraphIndex } from "./graph-index";
import { GraphAlgorithms } from "./graph-algorithms";
import { GraphQuery, type GraphQueryFilter, type GraphQueryResult } from "./graph-query";
import { GraphImpact, type ImpactReport, type RiskLevel } from "./graph-impact";

export class GraphService {
  readonly data: GraphData;
  readonly index: GraphIndex;
  readonly algorithms: GraphAlgorithms;
  readonly query: GraphQuery;
  readonly impact: GraphImpact;

  constructor(data: GraphData) {
    this.data = data;
    this.index = new GraphIndex(data);
    this.algorithms = new GraphAlgorithms(data);
    this.query = new GraphQuery(data, this.index, this.algorithms);
    this.impact = new GraphImpact(this.algorithms, this.index);
  }

  /* ─── Node lookup (delegates to GraphIndex) ─── */

  findNode(id: string): GraphNode | undefined {
    return this.index.findById(id);
  }

  /** O(1) symbol lookup by label (case-insensitive) */
  findSymbol(label: string): GraphNode[] {
    return this.index.findSymbol(label);
  }

  /** All nodes in a file */
  findByFile(filePath: string): GraphNode[] {
    return this.index.findByFile(filePath);
  }

  /* ─── Neighbors / Inspector (delegates to GraphAlgorithms) ─── */

  findNeighbors(id: string): { incoming: GraphNode[]; outgoing: GraphNode[] } {
    return this.algorithms.findNeighbors(id);
  }

  getInspector(id: string): InspectorData | null {
    const node = this.algorithms.findNode(id);
    if (!node) return null;
    const incoming = this.algorithms.getIncoming(id);
    const outgoing = this.algorithms.getOutgoing(id);
    const neighbors = this.findNeighbors(id);
    return {
      node,
      incoming,
      outgoing,
      neighbors: [...neighbors.incoming, ...neighbors.outgoing],
    };
  }

  /* ─── Algorithms (delegates to GraphAlgorithms) ─── */

  findImpact(nodeId: string): GraphNode[] {
    return this.algorithms.findImpact(nodeId);
  }

  /** Structured impact report — for AI Agents */
  getImpactReport(nodeId: string): ImpactReport | null {
    return this.impact.analyze(nodeId);
  }

  findShortestPath(fromId: string, toId: string): GraphNode[] | null {
    return this.algorithms.findShortestPath(fromId, toId);
  }

  findCircularDependencies(): string[][] {
    return this.algorithms.findCircularDependencies();
  }

  /* ─── Search (delegates to GraphQuery) ─── */

  /** Simple string search — for UI search box */
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

  /** Semantic query — for AI Agents */
  query2(filter: GraphQueryFilter): GraphQueryResult {
    return this.query.query(filter);
  }

  /* ─── Stats (inline — trivial) ─── */

  getStats(): GraphStats {
    return this.data.stats;
  }

  getTopNodes(limit = 10): Array<{ node: GraphNode; degree: number }> {
    const degree = new Map<string, number>();
    for (const n of this.data.nodes) degree.set(n.id, 0);
    for (const e of this.data.edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    return [...degree.entries()]
      .map(([id, d]) => ({ node: this.index.findById(id), degree: d }))
      .filter((x): x is { node: GraphNode; degree: number } => Boolean(x.node))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, limit);
  }

  // NOTE: getAIConfig() has been REMOVED.
  // AI prompts now live in AIAnalysisService — Single Responsibility.
  // Usage: AIAnalysisService.getPrompt(graphType) or AIAnalysisService.buildPrompt(service)
}
