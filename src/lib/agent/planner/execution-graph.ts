// CodeInsight AI — Execution Graph (Layer 6)
// DAG builder: constructs ExecutionGraph from PlanNode[], computes entry points,
// and provides topological sort for execution ordering.

import type { ExecutionGraph, PlanNode, PlanEdge, NodeStatus } from "../contracts";

export class ExecutionGraphBuilder {
  private nodes: Map<string, PlanNode> = new Map();
  private edges: PlanEdge[] = [];

  /** Add a node to the graph */
  addNode(node: PlanNode): this {
    this.nodes.set(node.id, node);
    // Auto-create dependency edges from dependsOn
    for (const depId of node.dependsOn) {
      this.edges.push({ from: depId, to: node.id, type: "dependency" });
    }
    return this;
  }

  /** Add a data-flow edge (non-dependency, for context passing) */
  addDataFlow(from: string, to: string): this {
    this.edges.push({ from, to, type: "data-flow" });
    return this;
  }

  /** Build the final ExecutionGraph */
  build(): ExecutionGraph {
    const nodeArray = [...this.nodes.values()];
    const entryPoints = nodeArray
      .filter((n) => n.dependsOn.length === 0)
      .map((n) => n.id);

    return {
      nodes: nodeArray,
      edges: this.edges,
      entryPoints,
    };
  }

  /** Topological sort — returns node IDs in execution order */
  topologicalSort(): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = this.nodes.get(nodeId);
      if (!node) return;

      // Visit dependencies first
      for (const depId of node.dependsOn) {
        visit(depId);
      }
      result.push(nodeId);
    };

    for (const nodeId of this.nodes.keys()) {
      visit(nodeId);
    }

    return result;
  }

  /** Get all nodes in a parallel group */
  getParallelGroup(group: string): PlanNode[] {
    return [...this.nodes.values()].filter((n) => n.parallelGroup === group);
  }

  /** Get nodes that can run immediately (no unmet dependencies) */
  getReadyNodes(completedNodeIds: Set<string>): PlanNode[] {
    return [...this.nodes.values()].filter((n) => {
      if (n.status !== "pending") return false;
      return n.dependsOn.every((depId) => completedNodeIds.has(depId));
    });
  }
}

/** Create a new node with defaults */
export function createNode(
  id: string,
  step: string,
  capability: PlanNode["capability"],
  params: Record<string, unknown> = {},
  options?: {
    dependsOn?: string[];
    parallelGroup?: string;
    toolName?: string;
  },
): PlanNode {
  return {
    id,
    step,
    capability,
    toolName: options?.toolName,
    params,
    dependsOn: options?.dependsOn ?? [],
    parallelGroup: options?.parallelGroup,
    status: "pending" as NodeStatus,
  };
}
