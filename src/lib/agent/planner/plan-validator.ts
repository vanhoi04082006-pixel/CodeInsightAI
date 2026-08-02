// CodeInsight AI — Plan Validator (Layer 6)
// Validates ExecutionGraph: no cycles, all deps exist, capabilities registered.

import type {
  ExecutionGraph,
  ExecutionPlan,
  Result,
  AgentError,
  Capability,
} from "../contracts";

export class PlanValidator {
  /**
   * Validate an ExecutionPlan.
   * Checks:
   * 1. All node IDs are unique
   * 2. All dependsOn references exist
   * 3. No cycles in dependency graph (DAG property)
   * 4. All capabilities are valid
   * 5. At least one entry point exists
   */
  validate(plan: ExecutionPlan, validCapabilities?: Capability[]): Result<void> {
    const errors: string[] = [];
    const { graph, policy } = plan;

    // 1. Check for duplicate node IDs
    const nodeIds = new Set<string>();
    for (const node of graph.nodes) {
      if (nodeIds.has(node.id)) {
        errors.push(`Duplicate node ID: ${node.id}`);
      }
      nodeIds.add(node.id);
    }

    // 2. Check all dependsOn references exist
    for (const node of graph.nodes) {
      for (const depId of node.dependsOn) {
        if (!nodeIds.has(depId)) {
          errors.push(`Node "${node.id}" depends on non-existent node: "${depId}"`);
        }
      }
    }

    // 3. Check for cycles (DFS-based cycle detection)
    const cycleError = this.detectCycles(graph);
    if (cycleError) {
      errors.push(cycleError);
    }

    // 4. Validate capabilities (if list provided)
    if (validCapabilities) {
      const validSet = new Set(validCapabilities);
      for (const node of graph.nodes) {
        if (!validSet.has(node.capability)) {
          errors.push(`Node "${node.id}" has unknown capability: "${node.capability}"`);
        }
      }
    }

    // 5. Check at least one entry point
    if (graph.entryPoints.length === 0 && graph.nodes.length > 0) {
      errors.push("No entry points found — all nodes have dependencies (possible cycle)");
    }

    // 6. Validate policy
    if (policy.maxParallel < 1) {
      errors.push("Policy maxParallel must be >= 1");
    }
    if (policy.defaultTimeout < 1000) {
      errors.push("Policy defaultTimeout must be >= 1000ms");
    }

    if (errors.length > 0) {
      return err("PLAN_INVALID", `Plan validation failed:\n${errors.join("\n")}`, { errors });
    }

    return ok(undefined);
  }

  /** Detect cycles using DFS with coloring (white/gray/black) */
  private detectCycles(graph: ExecutionGraph): string | null {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

    for (const node of graph.nodes) {
      color.set(node.id, WHITE);
    }

    let cyclePath: string[] = [];

    const dfs = (nodeId: string, path: string[]): boolean => {
      color.set(nodeId, GRAY);
      path.push(nodeId);

      const node = nodeMap.get(nodeId);
      if (node) {
        for (const depId of node.dependsOn) {
          const depColor = color.get(depId);
          if (depColor === GRAY) {
            const cycleStart = path.indexOf(depId);
            cyclePath = [...path.slice(cycleStart), depId];
            return true;
          }
          if (depColor === WHITE) {
            if (dfs(depId, path)) return true;
          }
        }
      }

      color.set(nodeId, BLACK);
      path.pop();
      return false;
    };

    for (const node of graph.nodes) {
      if (color.get(node.id) === WHITE) {
        if (dfs(node.id, [])) {
          return `Cycle detected: ${cyclePath.join(" → ")}`;
        }
      }
    }

    return null;
  }
}

// ─── Helpers ───

function ok(value: void): Result<void> {
  return { ok: true, value };
}

function err(code: string, message: string, details?: unknown): { ok: false; error: AgentError } {
  return { ok: false, error: { code, message, details, recoverable: false } };
}
