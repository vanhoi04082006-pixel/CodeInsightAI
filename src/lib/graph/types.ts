// CodeInsight AI — Unified Graph Engine Types
//
// A single, normalized `GraphData` shape that every graph provider converts
// its data source into. The `GraphService` (graph-engine.ts) operates on
// `GraphData` exclusively, so all 6 graph types share the same query API:
//   findNode / findNeighbors / getInspector / findImpact / findShortestPath /
//   findCircularDependencies / search / getStats / getTopNodes / getAIConfig.
//
// Sources:
//   - dependencies       → report.dependencies (static analyzer output)
//   - call-graph         → CodeGraphSnapshot (edges type === "calls")
//   - class-hierarchy    → CodeGraphSnapshot (edges "extends" / "implements")
//   - module-imports     → CodeGraphSnapshot (edges "imports")
//   - api-flow           → CodeGraphSnapshot (route nodes + callers)
//   - database-flow      → CodeGraphSnapshot (DB-related function/file nodes)

/* ---------- Graph type discriminator ---------- */

export type GraphType =
  | "dependencies"
  | "call-graph"
  | "class-hierarchy"
  | "module-imports"
  | "api-flow"
  | "database-flow";

/* ---------- Node + Edge (normalized, source-agnostic) ---------- */

export interface GraphNode {
  id: string;
  /** Kind of the node: file, function, class, module, route, component, import, service, util, ... */
  type: string;
  label: string;
  filePath?: string;
  language?: string;
  /** Optional line range (for symbol-level nodes from the CodeGraph). */
  startLine?: number;
  endLine?: number;
  metadata: {
    /** Visual group (drives color in the renderer). */
    group?: number;
    complexity?: number;
    linesOfCode?: number;
    description?: string;
    isExported?: boolean;
    isAsync?: boolean;
    params?: string[];
    returnType?: string;
    /** Pre-computed layout (used by the dependency graph renderer). */
    x?: number;
    y?: number;
    size?: number;
    /** True when this node participates in a circular dependency. */
    circular?: boolean;
    /** Count of unresolved outgoing calls (file-level only). */
    unresolvedCallCount?: number;
    /** Arbitrary extra fields (provider-specific). */
    [key: string]: unknown;
  };
}

export interface GraphEdge {
  from: string;
  to: string;
  /** Edge kind: calls, imports, extends, implements, uses, depends_on, exports. */
  type: string;
  weight: number;
  metadata?: {
    line?: number;
    context?: string;
    circular?: boolean;
    [key: string]: unknown;
  };
}

/* ---------- Stats ---------- */

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  byNodeType: Record<string, number>;
  byEdgeType: Record<string, number>;
  /** Each cycle is a list of node ids forming the cycle (in walk order). */
  circularDeps: string[][];
  /** Average total degree (in + out) across all nodes. */
  avgConnectivity: number;
}

/* ---------- Normalized graph payload ---------- */

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  type: GraphType;
  stats: GraphStats;
}

/* ---------- Provider interface ---------- */

export interface GraphProvider {
  type: GraphType;
  /**
   * Build a normalized `GraphData` for this provider's graph type.
   *
   * @param analysisId  The DB analysis id (used to look up CodeGraphSnapshot).
   * @param report      The fully-typed AnalysisReport (used by `dependency` provider).
   */
  load(analysisId: string, report: any): Promise<GraphData>;
}

/* ---------- Inspector (right-side node detail panel) ---------- */

export interface InspectorData {
  node: GraphNode;
  incoming: GraphEdge[];
  outgoing: GraphEdge[];
  /** All neighbor nodes (both incoming + outgoing, deduplicated). */
  neighbors: GraphNode[];
}

/* ---------- AI integration ---------- */

export interface GraphAIConfig {
  /** Type-specific system/user prompt fragment fed to the AI pass. */
  prompt: string;
  /** Human-readable title for the AI panel header. */
  title: string;
}
