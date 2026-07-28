// CodeInsight AI — AI Analysis Service
// Separated from GraphService per Single Responsibility Principle.
// GraphService only knows graph; this service knows AI.
//
// Flow: GraphEngine (data) → AIAnalysisService (prompt + context) → LLM

import type { GraphData, GraphType, GraphAIConfig } from "./types";
import type { GraphService } from "./graph-engine";

export interface AIAnalysisContext {
  graphType: GraphType;
  stats: { totalNodes: number; totalEdges: number; circularDeps: string[][]; avgConnectivity: number };
  topNodes: Array<{ label: string; type: string; degree: number; filePath?: string }>;
  cycles: string[][];
  impactHighlights?: Array<{ source: string; affectedCount: number; risk: string }>;
}

export class AIAnalysisService {
  /**
   * Get the type-specific AI prompt for a graph type.
   * This is the ONLY place that knows about AI prompts —
   * GraphService no longer contains prompt logic.
   */
  static getPrompt(graphType: GraphType): GraphAIConfig {
    return AI_PROMPTS[graphType] ?? AI_PROMPTS["dependencies"];
  }

  /**
   * Build a complete AI analysis context from a GraphService instance.
   * This is what gets serialized and sent to the LLM.
   */
  static buildContext(service: GraphService): AIAnalysisContext {
    const stats = service.getStats();
    const topNodes = service.getTopNodes(5).map(({ node, degree }) => ({
      label: node.label,
      type: node.type,
      degree,
      filePath: node.filePath,
    }));
    const cycles = service.findCircularDependencies();

    return {
      graphType: service.data.type,
      stats: {
        totalNodes: stats.totalNodes,
        totalEdges: stats.totalEdges,
        circularDeps: stats.circularDeps,
        avgConnectivity: stats.avgConnectivity,
      },
      topNodes,
      cycles,
    };
  }

  /**
   * Build the full prompt string (system + context) for the LLM.
   */
  static buildPrompt(service: GraphService): string {
    const config = this.getPrompt(service.data.type);
    const ctx = this.buildContext(service);

    const contextStr = [
      `Graph Type: ${ctx.graphType}`,
      `Stats: ${ctx.stats.totalNodes} nodes, ${ctx.stats.totalEdges} edges, ${ctx.stats.circularDeps} cycles, avg connectivity ${ctx.stats.avgConnectivity.toFixed(1)}`,
      ``,
      `Top nodes by connectivity:`,
      ...ctx.topNodes.map(n => `  - ${n.label} (${n.type}, degree: ${n.degree}${n.filePath ? `, file: ${n.filePath}` : ""})`),
      ``,
      ctx.cycles.length > 0
        ? `Circular dependencies (${ctx.cycles.length}):\n${ctx.cycles.slice(0, 5).map(c => `  - ${c.join(" → ")}`).join("\n")}`
        : `No circular dependencies detected.`,
    ].join("\n");

    return `${config.prompt}\n\n--- Graph Context ---\n${contextStr}`;
  }
}

/** AI prompt registry — type-specific prompts */
const AI_PROMPTS: Record<GraphType, GraphAIConfig> = {
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
      "layering violations. Recommend specific decoupling strategies.",
  },
  "api-flow": {
    title: "API Flow AI",
    prompt:
      "Analyze this API request flow graph. Identify the most-called " +
      "endpoints (high fan-in), N+1 query patterns, slow middleware chains, " +
      "and authentication bottlenecks. Recommend caching, batching, or " +
      "query optimization strategies.",
  },
  "database-flow": {
    title: "Database Flow AI",
    prompt:
      "Analyze this database access flow graph. Identify query hotspots, " +
      "potential N+1 query patterns, missing transaction boundaries, and " +
      "schema coupling. Propose specific indexing, batching, or query " +
      "consolidation changes.",
  },
};
