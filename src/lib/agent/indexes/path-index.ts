// CodeInsight AI — Path Index (Layer 1)
// Graph traversal: shortest path (BFS), all paths (DFS), cycle detection (Tarjan).
// Built from SemanticProjectModel.edges (depends_on + imports edges).

import type {
  SemanticEdge,
  PathIndex as IPathIndex,
} from "../contracts";

export class PathIndexImpl implements IPathIndex {
  /** Adjacency list: source → Set<target> */
  private readonly adjacency = new Map<string, Set<string>>();
  /** All unique nodes */
  private readonly nodes = new Set<string>();

  constructor(edges: readonly SemanticEdge[]) {
    for (const edge of edges) {
      const source = edge.source;
      const target = edge.target;

      this.nodes.add(source);
      this.nodes.add(target);

      const neighbors = this.adjacency.get(source) ?? new Set<string>();
      neighbors.add(target);
      this.adjacency.set(source, neighbors);
    }
  }

  /** Shortest path from → to using BFS. Returns null if no path. */
  shortestPath(from: string, to: string): string[] | null {
    if (from === to) return [from];
    if (!this.nodes.has(from) || !this.nodes.has(to)) return null;

    const visited = new Set<string>([from]);
    const queue: { node: string; path: string[] }[] = [{ node: from, path: [from] }];

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;
      const neighbors = this.adjacency.get(node);

      if (neighbors) {
        for (const neighbor of neighbors) {
          if (neighbor === to) {
            return [...path, neighbor];
          }
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push({ node: neighbor, path: [...path, neighbor] });
          }
        }
      }
    }

    return null;
  }

  /** All paths from → to using DFS with max depth limit. */
  allPaths(from: string, to: string, maxDepth: number): string[][] {
    if (!this.nodes.has(from) || !this.nodes.has(to)) return [];
    const results: string[][] = [];
    const visited = new Set<string>();

    const dfs = (current: string, target: string, path: string[], depth: number) => {
      if (depth > maxDepth) return;
      if (current === target) {
        results.push([...path]);
        return;
      }

      visited.add(current);
      const neighbors = this.adjacency.get(current);

      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            dfs(neighbor, target, [...path, neighbor], depth + 1);
          }
        }
      }
      visited.delete(current);
    };

    dfs(from, to, [from], 0);
    return results;
  }

  /** Detect all cycles using Tarjan's strongly connected components algorithm. */
  cyclicDependencies(): string[][] {
    const cycles: string[][] = [];
    const indexCounter = { value: 0 };
    const stack: string[] = [];
    const onStack = new Set<string>();
    const indices = new Map<string, number>();
    const lowLinks = new Map<string, number>();

    const strongConnect = (v: string) => {
      indices.set(v, indexCounter.value);
      lowLinks.set(v, indexCounter.value);
      indexCounter.value++;
      stack.push(v);
      onStack.add(v);

      const neighbors = this.adjacency.get(v);
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

      // If v is a root node, pop the SCC
      if (lowLinks.get(v) === indices.get(v)) {
        const scc: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
        } while (w !== v);

        // SCC with >1 node is a cycle; single node with self-loop is also a cycle
        if (scc.length > 1) {
          cycles.push(scc);
        } else if (scc.length === 1) {
          // Check for self-loop
          const selfNeighbors = this.adjacency.get(scc[0]);
          if (selfNeighbors?.has(scc[0])) {
            cycles.push(scc);
          }
        }
      }
    };

    for (const node of this.nodes) {
      if (!indices.has(node)) {
        strongConnect(node);
      }
    }

    return cycles;
  }
}
