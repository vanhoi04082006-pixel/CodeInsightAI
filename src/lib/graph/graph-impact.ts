// CodeInsight AI — Graph Impact Report
// Structured impact analysis — not just a list of nodes.
// Returns categorized impact with risk assessment.

import type { GraphNode } from "./types";
import { GraphAlgorithms } from "./graph-algorithms";
import { GraphIndex } from "./graph-index";

export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface ImpactReport {
  /** The node that was changed */
  source: { id: string; label: string; type: string; filePath?: string };
  /** All affected nodes (transitive dependents) */
  affectedNodes: GraphNode[];
  /** Affected nodes grouped by type */
  affectedFiles: GraphNode[];
  affectedRoutes: GraphNode[];
  affectedFunctions: GraphNode[];
  affectedClasses: GraphNode[];
  affectedTests: GraphNode[];
  /** Impact metrics */
  totalAffected: number;
  maxDepth: number;
  riskLevel: RiskLevel;
  /** Human-readable summary */
  summary: string;
}

export class GraphImpact {
  private readonly algorithms: GraphAlgorithms;
  private readonly index: GraphIndex;

  constructor(algorithms: GraphAlgorithms, index: GraphIndex) {
    this.algorithms = algorithms;
    this.index = index;
  }

  /**
   * Compute a structured impact report for a node.
   * Answers: "If I change X, what breaks?"
   */
  analyze(nodeId: string): ImpactReport | null {
    const node = this.algorithms.findNode(nodeId);
    if (!node) return null;

    const affected = this.algorithms.findImpact(nodeId);
    const maxDepth = this.computeMaxDepth(nodeId, affected);

    // Categorize by type
    const affectedFiles = affected.filter(n => n.type === "file");
    const affectedRoutes = affected.filter(n => n.type === "route");
    const affectedFunctions = affected.filter(n => n.type === "function");
    const affectedClasses = affected.filter(n => n.type === "class");
    const affectedTests = affected.filter(n =>
      n.filePath?.includes(".test.") || n.filePath?.includes(".spec.") || n.filePath?.includes("__tests__")
    );

    // Risk assessment
    const riskLevel = this.assessRisk({
      totalAffected: affected.length,
      affectedRoutes: affectedRoutes.length,
      affectedTests: affectedTests.length,
      maxDepth,
    });

    // Human-readable summary
    const parts: string[] = [];
    parts.push(`${affected.length} affected nodes`);
    if (affectedFiles.length > 0) parts.push(`${affectedFiles.length} files`);
    if (affectedRoutes.length > 0) parts.push(`${affectedRoutes.length} routes`);
    if (affectedTests.length > 0) parts.push(`${affectedTests.length} tests`);
    const summary = `${node.label} → ${parts.join(", ")}. Risk: ${riskLevel}.`;

    return {
      source: { id: node.id, label: node.label, type: node.type, filePath: node.filePath },
      affectedNodes: affected,
      affectedFiles,
      affectedRoutes,
      affectedFunctions,
      affectedClasses,
      affectedTests,
      totalAffected: affected.length,
      maxDepth,
      riskLevel,
      summary,
    };
  }

  /** Compute max BFS depth from source to furthest affected node */
  private computeMaxDepth(sourceId: string, affected: GraphNode[]): number {
    if (affected.length === 0) return 0;
    // BFS with depth tracking
    const visited = new Set<string>([sourceId]);
    const queue: Array<{ id: string; depth: number }> = [{ id: sourceId, depth: 0 }];
    let maxDepth = 0;
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      const neighbors = this.algorithms.findNeighbors(id);
      for (const n of neighbors.incoming) {
        if (!visited.has(n.id)) {
          visited.add(n.id);
          maxDepth = Math.max(maxDepth, depth + 1);
          queue.push({ id: n.id, depth: depth + 1 });
        }
      }
    }
    return maxDepth;
  }

  /** Assess risk based on impact metrics */
  private assessRisk(metrics: {
    totalAffected: number;
    affectedRoutes: number;
    affectedTests: number;
    maxDepth: number;
  }): RiskLevel {
    let score = 0;
    if (metrics.totalAffected > 20) score += 3;
    else if (metrics.totalAffected > 10) score += 2;
    else if (metrics.totalAffected > 5) score += 1;

    if (metrics.affectedRoutes > 0) score += 2;
    if (metrics.affectedTests > 10) score += 1;
    if (metrics.maxDepth > 5) score += 2;
    else if (metrics.maxDepth > 3) score += 1;

    if (score >= 6) return "CRITICAL";
    if (score >= 4) return "HIGH";
    if (score >= 2) return "MEDIUM";
    return "LOW";
  }
}
